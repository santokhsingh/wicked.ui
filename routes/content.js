'use strict';

var express = require('express');
var request = require('request');
var debug = require('debug')('portal:content');
var router = express.Router();
var contentRenderer = require('./renderContent');
var reqUtils = require('./requestUtils');

function isPublic(uriName) {
    return uriName.endsWith('jpg') ||
        uriName.endsWith('jpeg') ||
        uriName.endsWith('png') ||
        uriName.endsWith('gif') ||
        uriName.endsWith('css');
}

router.get('/*', function (req, res, next) {
    debug("get('/*'): " + req.path);
    var apiUrl = req.app.get('api_url');
    // Serve images and CSS as is
    if (isPublic(req.path)) {
        return request({
            url: apiUrl + '/content' + req.path,
            headers: { 'Correlation-Id': req.correlationId }
        }).pipe(res);
    }

    if (req.path !== '/toc') {
        debug('Normal content');
        var contentPath = '/content' + req.path;
        // Let's do dis
        reqUtils.get(req, contentPath,
            function (err, apiResponse, apiBody) {
                if (err)
                    return next(err);
                if (200 != apiResponse.statusCode)
                    return reqUtils.handleError(res, apiResponse, apiBody, next);
                contentRenderer.renderContent(req, res, contentPath, 'content', apiResponse, apiBody);
            });
    } else {
        debug('Table of contents');
        // Table of contents, special case
        reqUtils.get(req, '/content/toc',
            function (err, apiResponse, apiBody) {
                if (err)
                    return next(err);
                if (200 != apiResponse.statusCode)
                    return reqUtils.handleError(res, apiResponse, apiBody, next);
                debug(apiBody);
                var jsonBody = reqUtils.getJson(apiBody);
                var toc = categorize(jsonBody);
                res.render('content_toc', {
                    authUser: req.user,
                    glob: req.app.portalGlobals,
                    route: '/content/toc',
                    title: 'Table of Content',
                    subTitle: 'This is the site map for this API Portal, for your user.',
                    toc: toc
                });
            });
    }
});

function categorize(rawToc) {
    var toc = {};
    for (var i=0; i<rawToc.length; ++i) {
        var tocEntry = rawToc[i];
        if (!toc[tocEntry.category])
            toc[tocEntry.category] = {
                name: catName(tocEntry.category),
                entries: []
            };
        toc[tocEntry.category].entries.push(tocEntry);
    }
    return toc;
}

function catName(cat) {
    switch (cat) {
        case 'content': return 'Portal Content';
        case 'api': return 'APIs';
    }
    return cat;
}

module.exports = router;
