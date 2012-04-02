/*
Transform:DocumentHTML_Body_typeSomeTransform_Table
	a view:ModuleTransform, view:Transform, view:ViewTransform ;
	view:module "magnode/transform.DocumentHTML_BodyAuto_typeMongoDB_Table" ;
	view:domain type:SomeTransform_Table ;
	view:range type:DocumentHTML_Body .
*/
var util=require('util');
var url=require('url');

function htmlEscape(html){
  return String(html)
    .replace(/&(?!\w+;)/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function getTypeString(node){
	if(typeof(node)=="string") return "URI";
	if(!node) return "";
	if(typeof(node.language)=="string") return "@"+node.language;
	if(typeof(node.type)=="string") return node.type;
	return "";
}

function renderField(name, type, value){
	switch(type.type){
		case 'ObjectId': return 'ObjectId(<code>'+htmlEscape(value)+'</code>)';
		case 'string': 
			switch(type.format){
				case 'uri': return '<a href="'+htmlEscape(value)+'">'+htmlEscape(value)+'</a>';
				default: return htmlEscape(value);
			}

		case 'array':
		case 'json': return '<pre>'+htmlEscape(JSON.stringify(value))+'</pre>';
		default: return '<pre>'+util.inspect(value)+'</pre>';
	}

}

// This transform should be called by view when a ModuleTransform calls for this module
module.exports = function(db, transform, input, render, callback){
	var templateInputType = db.filter({subject:transform,predicate:"http://magnode.org/view/domain"}).map(function(v){return v.object;});
	var templateOutputType = db.filter({subject:transform,predicate:"http://magnode.org/view/range"}).map(function(v){return v.object;});
	var templateInverse = db.filter({subject:transform,predicate:"http://magnode.org/view/inverse"}).map(function(v){return v.object;});
	//var templateFile = input.db.filter({subject:templateOutputType[0],predicate:"http://magnode.org/view/file"})[0].object.toString();
	var node = input.node;
	var subject = node.subject;

	var action = url.parse(input.request.url, true);
	if(!node.subject) node.subject=node.resource;

	input['db-mongodb-schema'].findOne({subject:subject}, function(err, schema){
		if(err) throw new Error(err);

		input['db-mongodb'].find({type:subject}).toArray(function(err, list){
			if(err) throw new Error(err);

			var properties = schema&&schema.schema&&schema.schema.properties||{};
			var fieldNames = [];

			var headerHTML = [];
			for(var n in properties){
				headerHTML.push("<th>" + (properties[n]&&properties[n].title || n ||"") + "</th>");
			}

			var tableHTML = [];
			for(var i=0; i<list.length; i++){
				var fields = [];
				for(var n in properties){
					fields.push("<td>"+renderField(n, properties[n], list[i][n]||"")+"</td>");
					fieldNames.push(n);
				}
				fields.push("<td>"+renderField(n, {type:"json"}, node[n])+"</td>");
				tableHTML.push('<tr>'+fields.join('')+'</tr>');
			}

			result =
				'<div>'
				//+ '<pre>'+JSON.stringify(action.query)+'</pre>'
				//+ '<pre>nodes.find({type:'+JSON.stringify(subject)+'}) =\n'+JSON.stringify(list)+'</pre>'
				+ '<table>'
				+ '<thead><tr>'+headerHTML.join("")+'</tr></thead>'
				+ '<tbody>'+tableHTML.join("")+'</tbody>'
				+ '</table>'
				+ '</div>';
			var output = {};
			for(var j=0;j<templateOutputType.length;j++){
				output[templateOutputType[j]] = result;
			}
			callback(output);
		});
	});
}