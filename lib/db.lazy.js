/** Lazy Database, a file-backed in-memory RDF store
 * The file is append-only, except for periodic compaction

File format:

Newline spaced, JSON encoded
FILE := LINE*
LINE := RECORD JSON \n
RECORD := SHA1 // SHA1(JSON)
JSON := [^\n]{2,} // the remainder of the line containing the JSON-encoded RDF triples to insert or delete
	Format: {parents:[], i:{}, d:{}} each should be left out if empty
SHA1 := [0-9a-f]{40}

 */

var crypto=require('crypto');
var fs=require('fs');
var rdf=require('rdf');
rdf.setBuiltins();

module.exports = function(config){
	var self=this;

	this.parents = {};
	this.heads = [];

	this.stage = false;
	this.dbfd = null;

	this.clear();
	this.connectSync(config);
	//console.log("db.lazy data=");
	//console.log(this.data);

	this.commit = function(){if(self.writable) self.flush();}
}

var GraphProto = rdf.TripletGraph.prototype;
module.exports.prototype = Object.create(GraphProto);

module.exports.prototype.add = function add(triple){
	GraphProto.add.call(this, triple);
	if(!this.stage) return;
	if(!this.stage.i) this.stage.i={};
	if(!this.stage.i[triple.subject]) this.stage.i[triple.subject]={};
	if(!this.stage.i[triple.subject][triple.predicate]) this.stage.i[triple.subject][triple.predicate]=[];
	if(!this.stage.i[triple.subject][triple.predicate].some(function(v){return v==triple.object})){
		this.stage.i[triple.subject][triple.predicate].push(triple.object);
	}
}

module.exports.prototype.remove = function remove(triple){
	GraphProto.remove.call(this, triple);
	if(!this.stage) return;
	if(!this.stage.d) this.stage.d={};
	if(!this.stage.d[triple.subject]) this.stage.d[triple.subject]={};
	if(!this.stage.d[triple.subject][triple.predicate]) this.stage.d[triple.subject][triple.predicate]=[];
	if(!this.stage.d[triple.subject][triple.predicate].some(function(v){return v==triple.object})){
		this.stage.d[triple.subject][triple.predicate].push(triple.object);
	}
}

/** Connect to the database (synchronously)
 */
module.exports.prototype.connectSync = function connectSync(config){
	var self = this;
	console.log("db.lazy: Loading data from "+config.file+" ... ");
	function parseObject(o){
		if(o && typeof(o)==="object" && "value" in o){
			if("language" in o) return o.value.l(o.language);
			if("type" in o) return o.value.tl(o.type);
		}
		return o;
	}
	if(config.format=="json"){
		// blob loading is for testing only
		var data = JSON.parse(fs.readFileSync(config.file).toString());
		if(data){
			for(var a in data){
				for(var b in data[a]){
					for(var i=0;i<data[a][b].length;i++) {
						self.add(new rdf.RDFTriple(a, b, parseObject(data[a][b][i])));
					}
				}
			}
			console.log(" ... Parsed "+this.length+" triples into memory from JSON");
		}else{
			console.log(" ... Could not load JSON file");
		}
		self.format = "json";
		self.writable = false;
	}else if(config.format=="n3"){
		var turtleParser = new (require('rdf').TurtleParser)();
		turtleParser.parse(fs.readFileSync(config.file).toString(), undefined, undefined, undefined, this);
		console.log(" ... Parsed "+this.length+" triples into memory from Turtle file "+config.file);
		self.format = "n3";
		self.writable = false;
	}else{
		var operations = 0;
		var unparsed = fs.readFileSync(config.file).toString().replace(/([0-9a-f]*)(\{[^\n]*\})\n/g, function(a,h,d){
			operations++;
			if(config.hash!==false){
				var hash = crypto.createHash(config.hash||"sha1");
				hash.update(d);
				var hash = hash.digest('hex');
				if(h!==hash) throw new Error("Hash check failed: "+h+"!=="+hash);
			}
			var data=JSON.parse(d);
			if(data.parents){
				for(var i=0;i<data.parents.length;i++){
					if(self.parents[data.parents[i]]===undefined) throw new Error("Parent not found: "+data.parents[i]);
					var headsIndex = self.heads.indexOf(data.parents[i]);
					if(headsIndex===-1) throw new Error("Not a head: "+data.parents[i]);
					else self.heads.splice(headsIndex, 1);
				}
			}
			self.parents[h] = data.parents||[];
			self.heads.push(h);
			// Do Insert operations
			if(data.i){
				for(var a in data.i){
					//if(!self.data[a]) self.data[a] = {};
					for(var b in data.i[a]){
						//if(!self.data[a][b]) self.data[a][b] = [];
						for(var i=0;i<data.i[a][b].length;i++) {
							self.add(new rdf.RDFTriple(a, b, parseObject(data.i[a][b][i])));
						}
					}
				}
			}
			// Do Delete operations
			if(data.d){
				for(var a in data.d){
					for(var b in data.d[a]){
						for(var i=0;i<data.d[a][b].length;i++) {
							self.remove(new rdf.RDFTriple(a, b, parseObject(data.d[a][b][i])));
						}
						//if(!Object.keys(self.data[a][b]).length) delete(self.data[a][b]);
					}
					//if(!Object.keys(self.data[a]).length) delete(self.data[a]);
				}
			}
			return '';
		});
		console.log(" ... Parsed "+this.length+" triples into memory from "+operations+" operations from "+config.file);
		if(unparsed) console.error("db.lazy: "+unparsed.length+" characters of unparsed data from "+config.file);
		self.format = "lazy";
		self.writable = config.writable||true;
	}
	if(self.writable){
		self.dbfd = fs.openSync(config.file, 'a+');
		console.log(" "+config.file+" open for appending");
	}
	this.stage = {};
}

module.exports.prototype.flush = function flush(){
	if(!self.writable) return;
	if(self.format=="lazy"){
		var stage = {date:new Date().toString()};
		if(self.heads) stage.parents=self.heads;
		if(self.stage.d) stage.d=self.stage.d;
		if(self.stage.i) stage.i=self.stage.i;
		var data = JSON.stringify(stage);
		var hash = crypto.createHash(config.hash||"sha1");
		hash.update(data);
		var hash = hash.digest('hex');
		fs.write(self.dbfd, hash+data+"\n", null, null, null, function(err, length){console.log("db.lazy: Wrote "+length+" bytes to file");});
		self.heads = [hash];
		//var bytes=fs.writeSync(self.dbfd, hash+data+"\n"); console.log("db.lazy: Wrote "+bytes+" bytes to file");
	}
	else throw new Error("No write mechanism for the "+self.format+" format");
}

module.exports.generate =
	{ "@id":"http://magnode.org/transform/DBRDFN3_New"
	, domain:"http://magnode.org/DBRDFN3"
	, range:["http://magnode.org/DBRDFN3_Instance","http://magnode.org/DBRDF_Instance"]
	, arguments:
		[ {type:"literal", value:{subject:'$subject',predicate:'http://magnode.org/file',object:'$result'}}
		]
	, construct: function(filename){ return new module.exports({file:filename.toString(), format:"n3"}); }
	};
