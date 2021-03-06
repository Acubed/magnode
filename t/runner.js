#!/usr/bin/env node

var fs = require('fs');
var http = require('http');
var spawn = require('child_process').spawn;
var parseURL = require('url').parse;

var yaml = require('js-yaml');
var assert = require('chai').assert;
var mongodb = require('mongodb');

var parseMongoJSON = require('../setup/lib/parsemongojson');

var files = [];
var httpdExe = __dirname + '/../httpd.js';
var verbose = false;
var statusCode = 0;

process.on('exit', function(){
	console.log('Exit ' + statusCode);
	process.nextTick(function(){
		process.exit(statusCode);
	});
});

function printHelp(){
	console.log('USAGE: '+process.argv[0]+' '+process.argv[1]+' [options]');
}

// We're the main process, we're entitled to do this
String.prototype.contains = function(s){
	return this.indexOf(s)>=0;
}

var argv = process.argv.slice(2);
function argValue(){
	return argv[i][argn.length]=='=' ? argv[i].substring(argn.length+1) : argv[++i] ;
}
for(var i=0; i<argv.length; i++){
	var argn = argv[i].split('=',1)[0];
	switch(argn){
		case '--verbose': case '-v': verbose=true; break;
		case '--exe': case '-x': httpdExe=argValue(); break;
		case '--help':
		case '-?':
		case '-h':
			printHelp();
			return;
		default:
			files.push(argv[i]);
			break;
	}
}

function parseHeaders(data){
	var headers = [];
	data.split('\n').forEach(function(header){
		var name = header.split(':', 1)[0];
		if(!name) return;
		name = name.trim();
		var value = header.substring(name.length+1).trim();
		switch(name){
			case '-u':
			case '--user':
				name = 'Authorization';
				value = 'Basic ' + Buffer(value).toString('base64');
				break;
		}
		//headers[name] = value;
		headers.push({name:name, value:value});
	});
	return headers;
}

var fileFailures = {};
runFiles(0, function(){
	console.log('Done');
	for(var n in fileFailures){
		if(fileFailures[n]){
			console.log('  \u001b[31m\u2718\u001b[39m '+n+' ('+fileFailures[n]+' failures)');
		}else{
			console.log('  \u001b[32m\u2713\u001b[39m '+n);
		}
	}
});
function runFiles(i, callback){
	var nextFile = files[i];
	if(!nextFile) return void callback();
	runFile(nextFile, function(err, failures, res){
		fileFailures[nextFile] = failures;
		if(failures){
			statusCode = 1;
		}
		runFiles(i+1, callback);
	});
}
function runFile(filename, callback){
	console.log('Run file: '+filename);
	// 1. Arrange
	// Connect to a database
	var dbName = 'magnode-test-' + new Date().valueOf();
	var requests = [];
	var requestNames = {};
	var defaultRequest = {};
	var fileFailures = 0;
	yaml.loadAll(fs.readFileSync(filename, 'utf-8').replace(/\t/g, '    '), function(v){ requests.push(v); });
	var db, child;
	var running = true;
	mongodb.connect('mongodb://localhost/'+dbName, function(err, _db){
		if(err) throw err;
		db = _db;
		runFileDb();
	});

	function runFileDb(){
		// Verify the database does not exist (is not populated with any data)
		db.collections(function(err, names){
			if(err) throw err;
			if(names.length) throw new Error('Database already exists!');
			//var data = fs.readFileSync(__dirname+'/../setup/mongodb/schema/Schema.json'), 'utf-8');
			var importList = [
				{file:__dirname+'/../setup/mongodb/schema/Schema.json', collection:'schema'}
			].concat(requests[0].import||[]);
			parseMongoJSON.importFiles(importList, db, 'http://runner.local/', function(err){
				if(err) throw err;
				//console.log('Imported data', arguments);
				spawnHttpd();
			});
		});
	}
	function spawnHttpd(){
		// Import base.json data TODO
		var env = Object.create(process.env);
		env['PORT'] = '0';
		env['MAGNODE_MONGODB'] = 'mongodb://localhost/'+db.databaseName;
		env['MAGNODE_CONF'] = 't/runner.conf.json';
		child = spawn(httpdExe, ['--debug'], {env:env, stdio:[null,'pipe','pipe']});
		var childLog = '';
		child.stdout.on('data', function onData(str){
			if(verbose) process.stdout.write(str.toString());
			childLog += str.toString();
			var m;
			if(m=childLog.match(/HTTP server listening on IPv. (0.0.0.0|\[::\]):(\d+)/)){
				childLog = undefined;
				child.stdout.removeListener('data', onData);
				//console.log('Server came up on port '+m[2]);
				runRequests(child, {port:parseInt(m[2])});
			}
		});
		child.stderr.on('data', function onData(str){
			if(verbose) process.stdout.write('\u001b[31m'+str.toString()+'\u001b[39m');
			childLog += '\u001b[31m'+str.toString()+'\u001b[39m';
		});
		child.on('close', function(){
			if(running){
				console.error('httpd.js unexpectedly closed:');
				console.error(childLog.replace(/^/mg, '| '));
				fileFailures++;
			}
			finishTest();
		});
		child.on('error', function(e){
			console.log('child error:', e);
		});
	}
	function runRequests(child, client){
		// Wait for process to accept requests TODO
		// Import rest of resources TODO
		// 2. Act
		runRequest(0);
		function runRequest(i){
			if(running===false) return;
			var requestData = requests[i];
			if(!requestData) return void finishTest();
			if(requestData.default){
				defaultRequest = {};
				parseHeaders(requestData.default).forEach(function(v){ defaultRequest[v.name]=v.value; });
			}
			if(!requestData.request) return void runRequest(i+1);
			var headers = {Host: 'localhost'};
			for(var n in defaultRequest) headers[n]=defaultRequest[n];
			parseHeaders(requestData.request).forEach(function(v){ headers[v.name]=v.value; });
			var vars = requestData.vars || {};
			for(var v in vars){
				var fn = new Function('response', 'requests', '"use strict";'+vars[v]);
				try {
					var value = fn({}, requestNames);
				}catch(e){
					console.error('Failed evaluation of var:', e);
				}
				for(var n in headers){
					headers[n] = headers[n].replace('{{'+n+'}}', value);
				}
			}
			var resourceParts = parseURL(headers.Resource);
			headers['Host'] = resourceParts.host;
			var assertions = requestData.assert || [];
			if(!assertions.forEach) assertions=[assertions];
			var options = {};
			options.hostname = 'localhost';
			options.port = client.port;
			options.method = headers.Method;
			options.path = headers.Resource;
			delete headers.Method;
			delete headers.Resource;
			options.headers = headers;
			var label = requestData.label || (options.method+' '+options.path);
			if(requestData.body) headers['Content-Length']=requestData.body.length+'';
			console.log(filename+' #'+i+'/'+requests.length+' '+options.method+' <'+options.path+'> '+label);
			if(1){ // make this a switch sometime in the future (--verbose? --reporter=foo?)
				console.log('    > '+options.method+' '+options.path+' HTTP/1.1');
				Object.keys(headers).forEach(function(n){
					var v = headers[n];
					if(typeof v=='string') v=[v];
					v.forEach(function(w){ console.log('    > '+n+': '+w); });
				});
			}
			var req = http.request(options);
			if(requestData.id) requestNames[requestData.id]=req;
			req.on('error', function(e){
				console.error(e);
			});
			req.once('response', function(res){
				req.response = res;
				res.body = '';
				res.on('data', function(v){ res.body += v.toString(); });
				res.on('end', function(){
					// 3. Assert
					var failures = 0;
					assertions.forEach(function(a){
						var fn = new Function('assert', 'response', 'requests', '"use strict";'+a);
						try {
							fn(assert, res, {});
						} catch (e){
							failures++;
							console.log('    \u001b[31m\u2718\u001b[39m '+e.toString());
						}
					});
					if(failures){
						fileFailures++;
						console.log('      < HTTP/'+res.httpVersion+' '+res.statusCode);
						Object.keys(res.headers).forEach(function(n){
							var v = res.headers[n];
							if(typeof v=='string') v=[v];
							v.forEach(function(w){ console.log('      < '+n+': '+w); });
						});
						console.log('      <');
						console.log(res.body.replace(/^/gm, '      < '));
					}else{
						console.log('    \u001b[32m\u2713\u001b[39m Pass');
					}
					runRequest(i+1);
				});
			});
			req.end(requestData.body||'');
		}
	}
	function finishTest(){
		if(running===false) return;
		running = false;
		db.dropDatabase(function(){
			db.close();
			child.kill();
			callback(null, fileFailures, requests);
		});
	}
}
