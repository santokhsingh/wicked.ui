'use strict';
var request = require('request');
var express = require('express');
var router = express.Router();
var async = require('async');
var debug = require('debug')('portal:clarivate');
var tmp = require('tmp');
var fs = require('fs');
var util = require('util');
var utils = require('./utils');


router.get('/subscriptions', function (req, res, next) {
    debug("get('/subscriptions')");
    getAdmin(req, res, '/consumers', function (err, consumersResponse) {
      if (err)
        return next(err);
      var consumers = {} 
      var body = utils.getJson(consumersResponse.body);
      if(!body.data) return; 
      var pid;
      for (var i = 0; i < body.data.length; ++i) {
        var user_name = body.data[i].username;
        consumers[user_name] = body.data[i];
      }
          // This is not super good; this is expensive. Lots of calls.
     utils.getFromAsync(req, res, '/applications', 200, function (err, appsResponse) {
        if (err)
            return next(err);
        var appIds = [];
        for (var i = 0; i < appsResponse.length; ++i)
            appIds.push(appsResponse[i].id);
      
        // This is the expensive part:
        async.map(appIds, function (appId, callback) {
            utils.getFromAsync(req, res, '/applications/' + appId +'/subscriptions', 200, callback);
        }, function (err, appsSubscInfos) {
            if (err)
                return next(err);
            var subs=[];
            for (var i = 0; i < appsSubscInfos.length; ++i) {
                var sub = appsSubscInfos[i];
                 for (var j = 0; j < sub.length; ++j){
                    var application = sub[j].application;
                    var api = sub[j].api;
                    sub[j]["consumer"] = consumers[application+"$"+api];
                  subs.push(sub[j]);
                } 
            }
            res.json({
              title: 'All Subsriptions',
              subscriptions: subs
            });   
        });
      });  

    });

});

router.post('/customheaders/:pluginId', function (req, res, next) {  
  var body = utils.getJson(req.body);
  var pluginId = req.params.pluginId;
  var key = body.key;
  var apiId = body.api;
  var headers = body.headers;
  var pdata =  utils.getJson(body.pdata);
  var data=[];
  var foundExisting = false;
  for (var i = 0; i < pdata.headers.length; ++i) {
    if(pdata.headers[i].key===key){
       pdata.headers[i].headers = utils.getJson(headers);
       foundExisting = true;
    }
    data.push(utils.getText(pdata.headers[i]));
  }
  if(!foundExisting){
    data.push(utils.getText({"key": key, "headers":  utils.getJson(headers)}));
  }

  var myObject = {};
  var params = [];
  myObject["name"]= "custom-key-headers";
  myObject["config"] = {}
  for (var i = 0; i < data.length; ++i) {
    params.push(data[i]);
  }
  myObject["config"]["parameters"]=params;
 
  patchAdmin(req, res, '/apis/'+apiId+'/plugins/'+pluginId, myObject, function (err, pluginsResponse) {
    if (err)
       return next(err);
    res.json(pluginsResponse);
  });
});

function getBaseUri(req){
  var baseUrl = "http://localhost:8001";
  if(req.app.portalGlobals.network.kongAdminUrl){
      baseUrl = req.app.portalGlobals.network.kongAdminUrl;
  }
  return baseUrl;
}

function patchAdmin(req, res, uri, data, callback) {
   var baseUrl =  getBaseUri(req);
   request.patch(
        {
            
            url: baseUrl + uri,
            body: data,
            json: true,
        },
        callback);
}

function getAdmin(req, res, uri, callback) {
    var baseUrl =  getBaseUri(req);
    request.get(
        { 
            url: baseUrl + uri
        },
        callback);
};

router.get('/customheaders/:apiId', function (req, res, next) {
  var apiId = req.params.apiId;
  var payload=[];
  getAdmin(req, res, '/apis/'+apiId+'/plugins', function (err, pluginsResponse) {
     if (err)
       return next(err);
     var body = utils.getJson(pluginsResponse.body);
     var pid;
     if(!body.data) return;
     for (var i = 0; i < body.data.length; ++i) {
        var plugin_name = body.data[i].name;
        if(plugin_name === 'custom-key-headers'){
          var params = body.data[i].config.parameters;
          pid = body.data[i].id;
          for (var j = 0; j < params.length; ++j){
            payload.push(utils.getJson(params[j]));
          }
        }
     }
     res.json({ headers: payload, pluginid:  pid});    
  });
});   

module.exports = router;