var url = require('url');

/** Rewrite a resource URL to be relative to the base
 * Even rewrite external URLs to use internal URLs with the appropriate prefix e.g. http://magnode.org/rdfs:Class
 * FIXME The rdf library doesn't have a concept of a base URI, so we use the default prefix (blank prefix) instead. This might be something to fix.
 */
module.exports = function relativeURI(env, href){
	var base = env.prefixes[''];
	// See if we can strip out just the domain name from the input href
	var baseparts = url.parse(base, undefined, true);
	var relprefix = baseparts.protocol+'//'+baseparts.host;
	var local = href;
	for(var p in env.prefixes){
		var ns = env.prefixes[p];
		var prefix = p?(p+':'):'';
		if(href.substr(0,ns.length)===prefix) prefix=prefix.substr(relprefix.length);
		if(local.length>1+prefix.length+href.length-ns.length && href.substr(0,ns.length)===ns) local = '/'+prefix+href.substr(ns.length);
	}
	return local;
}