// import express from 'express';
// import crypto from 'crypto';
// import bodyParser from 'body-parser';
// import zipcode from 'zipcode';
// import request from "request";
// import Wunderground from 'node-weatherunderground';
// import twilio from 'twilio';
//
const express = require('express');
const crypto = require('crypto');
const bodyParser = require('body-parser');
const zipcode = require('zipcode');
const request = require('request');
const Wunderground = require('node-weatherunderground');
const twilio = require('twilio');

// Watson Work Services URL
const watsonWork = "https://api.watsonwork.ibm.com";

// Application Id, obtained from registering the application at https://developer.watsonwork.ibm.com
// const appId = process.env.WEATHER_CLIENT_ID;

// HSERVICE_CLIENT_ID='7c3de83c-5210-416c-9910-7b86189aa9f2'
// HSERVICE_CLIENT_SECRET='i82cddy5ptlv9k9lfmv2t05zkdg7gb6x'
// HSERVICE_WEBHOOK_SECRET='523ct5ka1ud52ld565aqbpbhk4qfwedr'
// HSERVICE_KEY='e2ef67207a596c6a'

const appId = process.env.HSERVICE_CLIENT_ID;

// Application secret. Obtained from registration of application.
// const appSecret = process.env.WEATHER_CLIENT_SECRET;
const appSecret = process.env.HSERVICE_CLIENT_SECRET;

// Webhook secret. Obtained from registration of a webhook.
// const webhookSecret = process.env.WEATHER_WEBHOOK_SECRET;
const webhookSecret = process.env.HSERVICE_WEBHOOK_SECRET;

// Weather Underground API Key
const weatherUndergroundKey = process.env.HSERVICE_KEY;

// Keyword to "listen" for when receiving outbound webhook calls.
const webhookKeyword = "@txtmsg";

const zipCodeError = (zc) => {
    return `Hmm, I can't seem to find the weather for ${zc}`;
}

const failMessage =
    `Hey, it's foggy and I had issues retrieving the weather. Try again later`;

const successMessage = (location, weather, temperature, winds, forcast_url) => {
    return `Current conditions (powered by Wunderground, an IBM company) for _${location}_: ${weather}
*Air temp* is ${temperature} and *winds* ${winds}
Click [here](${forcast_url}) to learn more.`;
};

const app = express();
const client = new Wunderground(weatherUndergroundKey);

// Send 200 and empty body for requests that won't be processed.
const ignoreMessage = (res) => {
    res.status(200).end();
}

// Process webhook verification requests
const verifyCallback = (req, res) => {
    console.log("Verifying challenge");

    const bodyToSend = {
        response: req.body.challenge
    };

    // Create a HMAC-SHA256 hash of the recieved body, using the webhook secret
    // as the key, to confirm webhook endpoint.
    const hashToSend =
        crypto.createHmac('sha256', webhookSecret)
        .update(JSON.stringify(bodyToSend))
        .digest('hex');

    res.set('X-OUTBOUND-TOKEN', hashToSend);
    res.send(bodyToSend).end();
};

// Validate events coming through and process only message-created or verification events.
const validateEvent = (req, res, next) => {

    // Event to Event Handler mapping
    const processEvent = {
        'verification': verifyCallback,
        'message-created': () => next()
    };

    // If event exists in processEvent, execute handler. If not, ignore message.
    return (processEvent[req.body.type]) ?
        processEvent[req.body.type](req, res) : ignoreMessage(res);
};

// Authenticate Application
const authenticateApp = (callback) => {

    // Authentication API
    const authenticationAPI = 'oauth/token';

    const authenticationOptions = {
        "method": "POST",
        "url": `${watsonWork}/${authenticationAPI}`,
        "auth": {
            "user": appId,
            "pass": appSecret
        },
        "form": {
            "grant_type": "client_credentials"
        }
    };

    request(authenticationOptions, (err, response, body) => {
        // If can't authenticate just return
        if (response.statusCode != 200) {
            console.log("Error authentication application. Exiting.");
            process.exit(1);
        }
        callback(JSON.parse(body).access_token);
    });
};

// Send message to Watson Workspace
const sendMessage = (spaceId, message) => {

    // Spaces API
    const spacesAPI = `v1/spaces/${spaceId}/messages`;

    // Photos API
    const photosAPI = `photos`;

    // Format for sending messages to Workspace
    const messageData = {
        type: "appMessage",
        version: 1.0,
        annotations: [{
            type: "generic",
            version: 1.0,
            color: "#D5212B",
            title: "Current weather conditions",
            text: message
        }]
    };

    // Authenticate application and send message.
    authenticateApp((jwt) => {

        const sendMessageOptions = {
            "method": "POST",
            "url": `${watsonWork}/${spacesAPI}`,
            "headers": {
                "Authorization": `Bearer ${jwt}`
            },
            "json": messageData
        };

        request(sendMessageOptions, (err, response, body) => {
            if (response.statusCode != 201) {
                console.log("Error posting weather information.");
                console.log(response.statusCode);
                console.log(err);
            }
        });
    });
};

// Ensure we can parse JSON when listening to requests
app.use(bodyParser.json());

app.get('/', (req, res) => {
    res.send('IBM Watson Workspace & Hackathon NYC');
});

app.post('/webhook2', (req, res) => {


    const TWILIO_ACCOUNTSID='';
    const TWILIO_AUTHTOKEN='';
    // const TWILIO_FROM='15005550006';
    const TWILIO_FROM='+';

    const client = require('twilio')(TWILIO_ACCOUNTSID, TWILIO_AUTHTOKEN);
    // let twilioto = req.body.twilioto;
    // let twiliobody = req.body.twiliobody;
    var twilioto = '+';
    var twiliobody = 'Just Hi';

    client.messages.create({
       to: twilioto,
       from: TWILIO_FROM,
       body: twiliobody
    },  (err, message) => {
      res.status(err ? 400 : 200).send(err || message);
    });

    // res.send('IBM Watson Workspace & Hackathon NYC'); return;
});

// This is callback URI that Watson Workspace will call when there's a new message created
// app.post('/webhook', (req, res) => {
app.post('/webhook', validateEvent, (req, res) => {

    // sendMessage('11', successMessage(dfjlasdjfsllfs));
    // res.send('IBM Watson Workspace & Hackathon NYC'); return;
    // Check if the first part of the message is '@weather'.
    // This lets us "listen" for the '@weather' keyword.


    if (req.body.content.indexOf(webhookKeyword) != 0) {
        ignoreMessage(res);
        return;
    }

    // Send status back to Watson Work to confirm receipt of message
    res.status(200).end();

    // Id of space where outbound event originated from.
    const spaceId = req.body.spaceId;

    ////////////////////////////////////////////////////////////

    // const TWILIO_ACCOUNTSID = process.env.TWILIO_ACCOUNTSID;
    // const TWILIO_AUTHTOKEN = process.env.TWILIO_AUTHTOKEN;
    // const TWILIO_FROM = process.env.TWILIO_FROM;
    const TWILIO_ACCOUNTSID='';
    const TWILIO_AUTHTOKEN='';
    // const TWILIO_FROM='15005550006';
    const TWILIO_FROM='+';

    const client = require('twilio')(TWILIO_ACCOUNTSID, TWILIO_AUTHTOKEN);
    // let twilioto = req.body.twilioto;
    // let twiliobody = req.body.twiliobody;
    var twilioto = '+12019892302';
    var twiliobody = 'We will have a meeting at Hack Hall on 2/4/17.';

    client.messages.create({
       to: twilioto,
       from: TWILIO_FROM,
       body: twiliobody
    },  (err, message) => {
      res.status(err ? 400 : 200).send(err || message);
    });
    // sendMessage(spaceId, successMessage('dlfjdlkjfalsdjflsadjkl')); return;
    ////////////////////////////////////////////////////////////



    // Parse zipcode from message body.
    // Expected format: <keyword> <zipcode>
    const zc = req.body.content.split(' ')[1];
    console.log('Getting weather for zipcode: \'' + zc + '\'');

    const cityState = zipcode.lookup(zc);

    // If lookup fails, send failure message to space.
    if (!cityState) {
        sendMessage(spaceId, zipCodeError(zc));
        return;
    }

    console.log('Looking up weather for: ' + cityState[0] + ', ' + cityState[1]);

    const opts = {
        city: cityState[0],
        state: cityState[1]
    }

    client.conditions(opts, function(err, data) {

        // If error, send message to Watson Workspace with failure message
        if (err) {
            sendMessage(spaceId, failMessage, res);
            return;
        }

        console.log("Posting current weather conditions back to space");
        sendMessage(spaceId, successMessage(data.display_location.full,
            data.weather, data.temperature_string, data.wind_string, data.forecast_url));
        return;
    });


});

// Kickoff the main process to listen to incoming requests
app.listen(process.env.PORT || 3000, () => {
    console.log('Weather app is listening on the port');
});
