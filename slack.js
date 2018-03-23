"use strict";
var request = require('request');
var fs = require('fs');

var http = require('http');

const express = require('express');
const bodyParser = require('body-parser');
const app = express();
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({
    extended: true
}));

var tokens = require('./slackToken.js');

app.post('/wake',
    function(req, res) {
        console.log(req.body);
        if (typeof req.body.token !== 'undefined' &&
            req.body.token === tokens.tokenWake &&
            typeof req.body.text !== 'undefined' &&
            typeof req.body.user_name !== 'undefined' &&
            typeof req.body.response_url !== 'undefined') {
            var calluser = req.body.user_name;
            var user = req.body.text;
            var response_url = req.body.response_url;

            request.post(
                'http://localhost:8080/wakeUpSlack', {
                    form: {
                        "user": user,
                        "calluser": calluser,
                        "response_url": response_url
                    }
                },
                function(error, response, body) {
                    if (!error && response.statusCode == 200) {
                        console.log("WAKE: Success!");
                        console.log(body);
                    }
                    else{
                        console.log("WAKE: Error with POST-request:");
                        console.log(error);
                    }
                }
            );
            res.end();
        }

    });

app.post('/lock',
    function(req, res) {
        console.log(req.body);
        if (typeof req.body.token !== 'undefined' &&
            req.body.token === tokens.tokenLock &&
            typeof req.body.text !== 'undefined' &&
            typeof req.body.user_name !== 'undefined' && 
            typeof req.body.response_url !== 'undefined') {
            var time = parseInt(req.body.text);
            var lockuser = req.body.user_name;
            var response_url = req.body.response_url;

            request.post(
                'http://localhost:8080/lockSlack', {
                    form: {
                        "time": time,
                        "lockuser": lockuser,
                        "response_url": response_url
                    }
                },
                function(error, response, body) {
                    if (!error && response.statusCode == 200) {
                        console.log("LOCK: Success!");
                        console.log(body);
                    }
                    else{
                        console.log("LOCK: Error with POST-request:");
                        console.log(error);
                    }
                }
            );
            res.end();
        }

    });

var httpServer = http.createServer(app);

httpServer.listen(8081);
console.log('listening on http://localhost:8081');