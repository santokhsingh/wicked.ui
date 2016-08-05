'use strict';

var express = require('express');
var debug = require('debug')('portal:index');
var contentRenderer = require('./renderContent');
var request = require('request');
var router = express.Router();
var reqUtils = require('./requestUtils'); 

/* GET home page. */
router.get('/', function (req, res, next) {
    debug("get('/')");
    var apiUrl = req.app.get('api_url');

    request({
        url: apiUrl + '/content',
        headers: { 'Correlation-Id': req.correlationId }
    }, function (err, apiResponse, apiBody) {
        if (err)
            return next(err);
        if (200 != apiResponse.statusCode)
            return reqUtils.handleError(res, apiResponse, apiBody, next);
        contentRenderer.renderContent(req, res, '/', 'index', apiResponse, apiBody);
    });
});

module.exports = router;
