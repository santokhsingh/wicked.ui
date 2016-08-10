'use strict';

/* global app */
var express = require('express');
var debug = require('debug')('portal:app');
var path = require('path');
var favicon = require('serve-favicon');
var logger = require('morgan');
var cookieParser = require('cookie-parser');
var bodyParser = require('body-parser');
var flash = require('connect-flash');

var index = require('./routes/index');
var signup = require('./routes/signup');
var forgotpassword = require('./routes/forgotpassword');
var apis = require('./routes/apis');
var applications = require('./routes/applications');
var content = require('./routes/content');
var users = require('./routes/users');
var admin = require('./routes/admin');
var verification = require('./routes/verification');
var validateemail = require('./routes/validateemail');
var swaggerUi = require('./routes/swaggerUi');
var ping = require('./routes/ping');
var help = require('./routes/help');
var kill = require('./routes/kill');
var reqUtils = require('./routes/requestUtils');
var portalGlobals = require('./portalGlobals');
var correlationIdHandler = require('portal-env').CorrelationIdHandler();

var passport = require('passport');
var fs = require('fs');
var session = require('express-session');
var FileStore = require('session-file-store')(session);

// Use default options, see https://www.npmjs.com/package/session-file-store
var sessionStoreOptions = {};

var SECRET = 'ThisIsASecret';

// Session: 15 minutes
var sessionArgs = {
    store: new FileStore(sessionStoreOptions),
    secret: SECRET,
    saveUninitialized: true,
    resave: false,
    cookie: {
        maxAge: 15 * 60 * 1000
    }
};

var app = express();
app.initialized = false;

var isProduction = false;
// TODO: This is crap. NODE_ENV is used in a different way here.
if (app.get('env') === 'production') {
    app.set('trust proxy', 1);
    sessionArgs.cookie.secure = true;
    isProduction = true;
}

// view engine setup
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'jade');

// Correlation ID
app.use(correlationIdHandler);

// Configure logger; log in JSON format.
logger.token('user-id', function (req, res) {
    var userId = reqUtils.getLoggedInUserId(req);
    return userId ? userId : '-';
});
logger.token('user-email', function (req, res) {
    var email = reqUtils.getLoggedInUserEmail(req);
    return email ? email : '-';
});
logger.token('correlation-id', function (req, res) {
    return req.correlationId;
});

app.use(logger('{"date":":date[clf]","method":":method","url":":url","remote-addr":":remote-addr","user-id":":user-id","user-email":":user-email","version":":http-version","status":":status","content-length":":res[content-length]","referrer":":referrer","user-agent":":user-agent","response-time":":response-time","correlation-id":":correlation-id"}'));

// We want to serve static content and "ping" without using a session.
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.static(path.join(__dirname, 'node_modules/bootstrap/dist')));
app.use('/bootstrap-show-password', express.static(path.join(__dirname, 'node_modules/bootstrap-show-password')));

// Initializing state
app.use('/ping', ping);
app.use(function (req, res, next) {
    if (app.initialized)
        return next();
    res.status(503).render('ready_in_a_second', {});
});

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: false }));
app.use(cookieParser(SECRET));
app.use(session(sessionArgs));
app.use(flash());
app.use(passport.initialize());
app.use(passport.session());
app.disable('x-powered-by'); // Remove powered by Express

// "production" mode sanity checking. If we're on "production" mode,
// we will have set (see above) cookie.secure to true, and thus cookies
// will not be sent to the backend in case the protocol in the front end
// is not https. This will result in super strange behaviour, like not
// being able to log in, and creating new sessions for each http request.
app.use(function (req, res, next) {
    if (isProduction && 
        !req.path.startsWith('/swagger-ui') &&
        req.get('x-forwarded-proto') != 'https')
        return next(new Error('You are running in "production" (NODE_ENV) mode, but not on https. This is not supported.'));
    next();
});

// This will be called as soon as the globals are present.
app.initialize = function (done) {
    debug('initialize()');

    if (app.get('env') === 'production' &&
        portalGlobals.glob.network.schema != 'https') {
        throw new Error('You are running in "production" mode (NODE_ENV), but not using https. This is not supported (Cookies cannot be transported).');
    }

    app.get('/', index);
    app.use('/signup', signup);
    app.use('/forgotpassword', forgotpassword);
    app.use('/apis', apis);
    app.use('/applications', applications);

    app.get('/contact', function (req, res, next) { res.redirect('/content/contact'); });
    app.use('/content', content);
    app.use('/users', users);
    app.use('/admin', admin);
    app.use('/verification', verification);
    app.use('/validateemail', validateemail);
    app.use('/swagger-ui', swaggerUi);
    app.use('/swagger-ui', express.static(path.join(__dirname, 'swagger-ui')));
    app.use('/swagger-ui', express.static(path.join(__dirname, 'node_modules/swagger-ui/dist')));
    app.use('/help', help);
    app.use('/kill', kill);

    // Late loading as it requires things from portalGlobals!
    var login = require('./routes/login');
    app.use('/login', login);

    // Plugin Authentication with PassportJS modules, if defined
    if (portalGlobals.glob.auth.github && portalGlobals.glob.auth.github.useGithub) {
        debug('Activating Github passport.');
        app.use('/callback/github',
            passport.authenticate('github', {
                failureRedirect: '/login'
            }),
            function (req, res) {
                res.redirect('/signup');
            });
    }

    if (portalGlobals.glob.auth.google && portalGlobals.glob.auth.google.useGoogle) {
        debug('Activating Google passport.');
        app.use('/callback/google',
            passport.authenticate('google', {
                failureRedirect: '/login'
            }),
            function (req, res) {
                res.redirect('/signup');
            });
    }

    if (portalGlobals.glob.auth.adfs && portalGlobals.glob.auth.adfs.useAdfs) {
        debug('Activating ADFS passport.');
        app.use('/callback',
            passport.authenticate('adfs'),
            function (req, res) {
                res.redirect('/signup');
            });
    }

    // catch 404 and forward to error handler
    app.use(function (req, res, next) {
        var err = new Error('Not Found');
        err.status = 404;
        next(err);
    });

    // error handlers

    // development error handler
    // will print stacktrace
    if ((app.get('env') === 'development') ) { // TODO: || !process.env.WICKED_IN_DOCKER) {
        app.use(function (err, req, res, next) {
            debug(err);
            res.status(err.status || 500);
            if (!reqUtils.acceptJson(req)) {
                res.render('error', {
                    title: 'Error',
                    glob: app.portalGlobals,
                    message: err.message,
                    error: err,
                    correlationId: req.correlationId
                });
            } else {
                res.json({
                    statusCode: res.statusCode,
                    message: err.message,
                    error: err,
                    correlationId: req.correlationId
                });
            }
        });
    }

    // production error handler
    // no stacktraces leaked to user
    app.use(function (err, req, res, next) {
        debug(err);
        var status = err.status || 500;
        res.status(status);
        if (!reqUtils.acceptJson(req)) {
            var errorTemplate = 'error'; // default error template

            switch (status) {
                case 403: errorTemplate = 'error_403'; break;
                case 404: errorTemplate = 'error_404'; break;
            }
            
            res.render(errorTemplate, {
                authUser: req.user,
                title: 'Error',
                glob: app.portalGlobals,
                message: err.message,
                error: { status: status },
                correlationId: req.correlationId
            });
        } else {
            res.json({
                statusCode: res.statusCode,
                message: err.message,
                error: { status: status },
                correlationId: req.correlationId
            });
        }
    });
    if (done)
        done();
};




module.exports = app;
