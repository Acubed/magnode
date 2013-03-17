var escapeHTML = require('./htmlutils').escapeHTML;
var escapeHTMLAttr = require('./htmlutils').escapeHTMLAttr;

function generateHTML(name, instance, schema){
	return '<pre class="field-date">'+escapeHTML(instance.toString())+'</pre>';
}

function generateForm(name, instance, schema){
	return '<input name="'+escapeHTMLAttr(name)+'.value" value="'+escapeHTMLAttr(instance)+'" type="text" class="field-date"/>';
}

function parseForm(name, fieldData){
	var value = fieldData[name+'.value'];
	return (value.toLowerCase()=='now')?new Date():new Date(value);
}

module.exports = require('./scan.widget').create('Date', generateHTML, generateForm, parseForm);