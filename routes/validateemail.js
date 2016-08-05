'use strict';

var express = require('express');
var debug = require('debug')('portal:validateemail');
var router = express.Router();
//var async = require('async');
var reqUtils = require('./requestUtils');

router.get('/', function(req, res, next) {
    debug("get('/')");
    var loggedInUserId = reqUtils.getLoggedInUserId(req);
    if (!loggedInUserId) {
        var err = new Error('You must be logged in to validate your email address.');
        err.status = 403;
        return next(err);
    }
    
    reqUtils.getFromAsync(req, res, '/users/' + loggedInUserId, 200, function(err, userInfo) {
        if (err)
            return next(err);
        
        res.render('validate_email', {
            title: 'Validate Email Address',
            authUser: req.user,
            glob: req.app.portalGlobals,
            userInfo: userInfo
        });
    });  
});

router.post('/', function(req, res, next) {
    debug("post('/')");
    var loggedInUserId = reqUtils.getLoggedInUserId(req);
    if (!loggedInUserId) {
        var err = new Error('You must be logged in to validate your email address.');
        err.status = 403;
        return next(err);
    }
    var newVerif = {
        type: 'email',
        email: req.user.email  
    };
    reqUtils.post(req, '/verifications', newVerif, function(err, apiResponse, apiBody) {
        if (err)
            return next(err);
        // Let's hope this works out; we can't actually tell.
        // TODO: Do we have to know?
        
        res.render('validate_email_confirm', {
            title: 'Email Validation Confirmation',
            authUser: req.user,
            glob: req.app.portalGlobals,
        }); 
    });
});

module.exports = router;