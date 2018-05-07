'use strict';
/* jshint loopfunc: true */

var { debug, info, warn, error } = require('portal-env').Logger('portal:auth');

var utils = require('../routes/utils');

var federate = function () { };

federate.userLogin = function (req, userCreateInfo, done) {
    debug('userLogin(): ' + userCreateInfo.customId);
    // Do we know this user?
    utils.get(req, '/users?customId=' + userCreateInfo.customId, function (err, apiResponse, apiBody) {
        if (err)
            return done(err);
        debug('GET /users?customId=' + userCreateInfo.customId + ' returned ' + apiResponse.statusCode);
        if (200 == apiResponse.statusCode) {
            // Yes, we know him.
            var userId = utils.getJson(apiBody)[0].id;
            utils.getAsUser(req, '/users/' + userId, userId, function (err, apiResponse, apiBody) {
                if (err)
                    return done(err);
                if (200 != apiResponse.statusCode) {
                    var userGetErr = new Error('Could not retrieve user information for user: ' + userId);
                    userGetErr.status = apiResponse.statusCode;
                    return done(err);
                }
                var user = utils.getJson(apiBody); // Make sure it's JSON

                // Group check; do we need to assign any new groups?
                var groupCheck = checkMissingGroups(userCreateInfo.groups, user.groups);
                if (groupCheck.updateNeeded) {
                    user.groups = groupCheck.groups;
                    utils.patchAsUser(req, '/users/' + userId, userId, user, function (patchErr, patchResponse, patchBody) {
                        if (patchErr || 200 != patchResponse.statusCode)
                            return done(null, false, { message: 'Could not update User\'s groups. Login failed. Status: ' + patchResponse.statusCode });
                        user = utils.getJson(patchBody);
                        done(null, user);
                    });
                } else {
                    return done(null, user);
                }
            });
        } else {
            utils.post(req, '/users', userCreateInfo, function (err, res, body) {
                if (res.statusCode === 201) {
                    //var localUserResponse = [body];
                    //userLoadFinished(localUserResponse, done);
                    done(null, utils.getJson(body));
                } else {
                    debug(body);
                    done(null, false, { message: res.body.message });
                }
            });
        }
    });
};

function checkMissingGroups(adfsGroups, userGroups) {
    debug('checkMissingGroups()');
    var updatedGroups = userGroups;
    var updateNeeded = false;
    for (var i=0; i<adfsGroups.length; ++i) {
        if (!updatedGroups.find(function(g) { return g == adfsGroups[i]; })) {
            updatedGroups.push(adfsGroups[i]);
            updateNeeded = true;            
        }
    }
    return {
        updateNeeded: updateNeeded,
        groups: updatedGroups
    };
}

module.exports = federate;