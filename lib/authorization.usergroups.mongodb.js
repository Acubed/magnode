/** Approve actions when authorized by a usergroup that the user is a member of */

module.exports = function usergroupsMongoDB(userDb, groupDb){
	this.userDb = userDb;
	this.groupDb = groupDb;
	this.accountType = 'http://magnode.org/OnlineAccount';
	this.groupType = 'http://magnode.org/Usergroup';
}

module.exports.prototype.test = function usergroupsMongoDBTest(user, actions, resources, callback){
	var self = this;
	if(!user) user=resources;
	var session = user.authentication;
	if(!session || !session.id || !this.userDb || !this.groupDb){
		return void callback(false);
	}
	this.userDb.findOne({subject:session.id, type:this.accountType}, function(err, userDoc){
		if(err || !userDoc) return void callback(false);
		var authorized = false;
		var targetTypes = resources.node&&resources.node.type || [];
		var userTypes = (userDoc.type instanceof Array)?userDoc.type:[];
		var targetActions = Array.isArray(actions)?actions:[actions];
		for(var i=0; i<targetActions.length; i++) switch(targetActions[i]){
			case 'GET': targetActions.push('view'); break;
			case 'PUT': targetActions.push('edit'); break;
		}
		self.groupDb.find({subject:{$in:userTypes},type:self.groupType,grant:{$exists:1}}).each(function(err, doc){
			if(err) recordDone(err);
			else if(doc) recordNext(doc);
			else recordDone();
		});
		function recordNext(doc){
			if(!(doc.grant instanceof Array)) return;
			doc.grant.forEach(function(grant){
				if(!(grant.type instanceof Array) || !(grant.action instanceof Array)) return;
				// Check type/actions matches
				function isEvery(v){if(v instanceof Array) return v.any(isAny); else return targetTypes.indexOf(v)>=0; }
				function isAny(v){if(v instanceof Array) return v.every(isEvery); else return targetTypes.indexOf(v)>=0; }
				if(!grant.type.every(isEvery)) return;
				if(!targetActions.every(function(v){ return grant.action.indexOf(v)>=0; })) return;
				// Check where clauses for additional restrictions
				function testClause(v){
					// hard-code one type of test, checking that the owner of the resource matches the logged-in session
					if(v==='input.session.subject===input.node.subject'){
						return (resources.session && resources.session.subject && resources.node && resources.node.subject && resources.session.subject===resources.node.subject);
					}
					return false;
				}
				if(!grant.where.every(testClause)) return;
				// If we haven't failed by now, this grant passes
				authorized=true;
			});
		}
		function recordDone(err){
			if(err){
				console.error(err.stack||err.toString());
				return void callback(false);
			}
			callback(authorized);
		}
	});
}
