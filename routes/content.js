'use strict';

var express = require('express');
var request = require('request');
var { debug, info, warn, error } = require('portal-env').Logger('portal:content');
var router = express.Router();
var contentRenderer = require('./renderContent');
var utils = require('./utils');

function isPublic(uriName) {
    return uriName.endsWith('jpg') ||
        uriName.endsWith('jpeg') ||
        uriName.endsWith('png') ||
        uriName.endsWith('gif') ||
        uriName.endsWith('css');
}

router.get('/*', function (req, res, next) {
    debug("get('/*'): " + req.path);

    // Serve images and CSS as is
    if (!req.session) {
        if (isPublic(req.path)) {
            return utils.pipe(req, res, '/content' + req.path);
        } else {
            return next();
        }
    } else {
        if (req.path !== '/toc') {
            debug('Normal content');
            var contentPath = '/content' + req.path;
            // Let's do dis
            utils.get(req, contentPath,
                function (err, apiResponse, apiBody) {
                    if (err)
                        return next(err);
                    if (200 != apiResponse.statusCode)
                        return utils.handleError(res, apiResponse, apiBody, next);
                    contentRenderer.renderContent(req, res, contentPath, 'content', apiResponse, apiBody);
                });
        } else {
            debug('Table of contents');
            // Table of contents, special case
            utils.get(req, '/content/toc',
                function (err, apiResponse, apiBody) {
                    if (err)
                        return next(err);
                    if (200 != apiResponse.statusCode)
                        return utils.handleError(res, apiResponse, apiBody, next);
                    debug(apiBody);
                    var jsonBody = utils.getJson(apiBody);
                    var toc = categorize(jsonBody);
                    res.render('content_toc', {
                        authUser: req.user,
                        glob: req.app.portalGlobals,
                        route: '/content/toc',
                        title: 'Site Map',
                        subTitle: 'This site map displays API content and general site content. Note that API content varies depending on the user group to which you belong.',
                        toc: toc
                    });
                });
        }
    }
});

function categorize(rawToc) {
    var toc = {};
    for (var i = 0; i < rawToc.length; ++i) {
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
