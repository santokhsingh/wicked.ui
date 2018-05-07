'use strict';

var { debug, info, warn, error } = require('portal-env').Logger('portal:renderMarkdown');
var marked = require('marked');
var highlightJs = require('highlight.js');
var jade = require('jade');

var renderer = function () { };

// Synchronous highlighting with highlight.js; see also layout.jade, where
// the client side scripts are injected. 
marked.setOptions({
    highlight: function (code) {
        return highlightJs.highlightAuto(code).value;
    }
});

renderer.renderContent = function (req, res, subRoute, layout, apiResponse, body) {
    debug('renderMarkdown()');
    var metaInfo = { showTitle: false };
    var metaInfo64 = apiResponse.headers['x-metainfo'];
    if (metaInfo64)
        metaInfo = JSON.parse(new Buffer(metaInfo64, 'base64'));
    debug(metaInfo);

    var contentType = apiResponse.headers['content-type'];

    var title = null;
    if (metaInfo.title)
        title = metaInfo.title;
    var subTitle = null;
    if (metaInfo.subTitle)
        subTitle = marked(metaInfo.subTitle);

    var renderRoute = subRoute;
    var viewModel = {
        authUser: req.user,
        glob: req.app.portalGlobals,
        route: renderRoute,
        showTitle: metaInfo.showTitle,
        omitContainer: metaInfo.omitContainer,
        title: title,
        subTitle: subTitle
    };
    
    if ("text/jade" == contentType) {
        viewModel.content = jade.render(body, viewModel);
    } else { // Assume markdown
        viewModel.content = marked(body);
    }

    res.render(
        layout,
        viewModel
    );
};

module.exports = renderer;