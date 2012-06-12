/*
Generates a list of menu items from documents with attached "menu" properties in the database.

e.g. Transform:Menu_MainMenu_typeDocument
	a view:Transform, view:ModuleTransform, view:FormTransform, view:ViewTransform ;
	view:menuItemContentTypes type:Raw, type:Page ;
	view:module "magnode/transform.Menu_typeDocument" ;
	view:range type:Menu_MainMenu .

TODO: Not all document types will define menu items the same way
TODO: Maybe the configuration should be specified as an input argument, not as a property to the transform
FIXME: This queries multiple documents every time it's requested. This needs to be cached in some way.
*/

module.exports = function(db, transform, input, render, callback){
	var outTypes = db.filter({subject:transform,predicate:"http://magnode.org/view/range"}).map(function(v){return v.object;});
	var contentTypes = db.filter({subject:transform,predicate:"http://magnode.org/view/menuItemContentTypes"}).map(function(v){return v.object;});
	var menuItems = [];
	input.db.find({type:{$in:contentTypes},"menu":{$exists:true}},{_id:1,subject:1,menu:1}).forEach(
	function(node){
		outTypes.forEach(function(menuId){
			var item = node.menu[menuId];
			if(!item) return;
			menuItems.push({href:node.subject,value:item.title,weight:item.weight});
		});
	},
	function(err){
		menuItems.sort(function(a,b){return (a.weight||0)-(b.weight||0);});
		var r = {};
		for(var i=0; i<outTypes.length; i++) r[outTypes[i]]=menuItems;
		callback(r);
	});
}
module.exports.URI = "http://magnode.org/transform/Menu_typeDocument";