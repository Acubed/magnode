/*
e.g. Transform:DocumentJSON_typeContentType
	a view:ModuleTransform, view:ViewTransform ;
	view:module "magnode/transform.Document_typeJSON" ;
	view:domain type:ContentType ;
	view:range type:Document, type:DocumentJSON .
*/
var util=require('util');
var url=require('url');

// This transform should be called by view when a ModuleTransform calls for this module
module.exports = function(db, transform, resources, render, callback){
	var resourcesTypeFirst = db.match(transform,"http://magnode.org/view/domain").map(function(v){return v.object;})[0];
	var resourcesTypes = db.getCollection(resourcesTypeFirst);
	var outputTypes = db.match(transform,"http://magnode.org/view/range").map(function(v){return v.object;});
	var result = JSON.stringify(resources[resourcesTypes[0]]);
	var output = {};
	outputTypes.forEach(function(v){output[v]=result;});
	output['HTTP-Content-Type'] = 'application/json';
	callback(null, output);
}