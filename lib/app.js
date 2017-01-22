'use strict';

var _express = require('express');

var _express2 = _interopRequireDefault(_express);

var _crypto = require('crypto');

var _crypto2 = _interopRequireDefault(_crypto);

var _bodyParser = require('body-parser');

var _bodyParser2 = _interopRequireDefault(_bodyParser);

var _zipcode = require('zipcode');

var _zipcode2 = _interopRequireDefault(_zipcode);

var _request = require('request');

var _request2 = _interopRequireDefault(_request);

var _nodeWeatherunderground = require('node-weatherunderground');

var _nodeWeatherunderground2 = _interopRequireDefault(_nodeWeatherunderground);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

// Watson Work Services URL
var watsonWork = "https://api.watsonwork.ibm.com";

// Application Id, obtained from registering the application at https://developer.watsonwork.ibm.com
var appId = process.env.WEATHER_CLIENT_ID;

// Application secret. Obtained from registration of application.
var appSecret = process.env.WEATHER_CLIENT_SECRET;

// Webhook secret. Obtained from registration of a webhook.
var webhookSecret = process.env.WEATHER_WEBHOOK_SECRET;

// Weather Underground API Key
var weatherUndergroundKey = process.env.WEATHER_KEY;

// Keyword to "listen" for when receiving outbound webhook calls.
var webhookKeyword = "@weather";

var zipCodeError = function zipCodeError(zc) {
  return 'Hmm, I can\'t seem to find the weather for ' + zc;
};

var failMessage = 'Hey, it\'s foggy and I had issues retrieving the weather. Try again later';

var successMessage = function successMessage(location, weather, temperature, winds, forcast_url) {
  return 'Current conditions (powered by Wunderground, an IBM company) for _' + location + '_: ' + weather + '\n*Air temp* is ' + temperature + ' and *winds* ' + winds + '\nClick [here](' + forcast_url + ') to learn more.';
};

var app = (0, _express2.default)();
var client = new _nodeWeatherunderground2.default(weatherUndergroundKey);

// Send 200 and empty body for requests that won't be processed.
var ignoreMessage = function ignoreMessage(res) {
  res.status(200).end();
};

// Process webhook verification requests
var verifyCallback = function verifyCallback(req, res) {
  console.log("Verifying challenge");

  var bodyToSend = {
    response: req.body.challenge
  };

  // Create a HMAC-SHA256 hash of the recieved body, using the webhook secret
  // as the key, to confirm webhook endpoint.
  var hashToSend = _crypto2.default.createHmac('sha256', webhookSecret).update(JSON.stringify(bodyToSend)).digest('hex');

  res.set('X-OUTBOUND-TOKEN', hashToSend);
  res.send(bodyToSend).end();
};

// Validate events coming through and process only message-created or verification events.
var validateEvent = function validateEvent(req, res, next) {

  // Event to Event Handler mapping
  var processEvent = {
    'verification': verifyCallback,
    'message-created': function messageCreated() {
      return next();
    }
  };

  // If event exists in processEvent, execute handler. If not, ignore message.
  return processEvent[req.body.type] ? processEvent[req.body.type](req, res) : ignoreMessage(res);
};

// Authenticate Application
var authenticateApp = function authenticateApp(callback) {

  // Authentication API
  var authenticationAPI = 'oauth/token';

  var authenticationOptions = {
    "method": "POST",
    "url": watsonWork + '/' + authenticationAPI,
    "auth": {
      "user": appId,
      "pass": appSecret
    },
    "form": {
      "grant_type": "client_credentials"
    }
  };

  (0, _request2.default)(authenticationOptions, function (err, response, body) {
    // If can't authenticate just return
    if (response.statusCode != 200) {
      console.log("Error authentication application. Exiting.");
      process.exit(1);
    }
    callback(JSON.parse(body).access_token);
  });
};

// Send message to Watson Workspace
var sendMessage = function sendMessage(spaceId, message) {

  // Spaces API
  var spacesAPI = 'v1/spaces/' + spaceId + '/messages';

  // Photos API
  var photosAPI = 'photos';

  // Format for sending messages to Workspace
  var messageData = {
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
  authenticateApp(function (jwt) {

    var sendMessageOptions = {
      "method": "POST",
      "url": watsonWork + '/' + spacesAPI,
      "headers": {
        "Authorization": 'Bearer ' + jwt
      },
      "json": messageData
    };

    (0, _request2.default)(sendMessageOptions, function (err, response, body) {
      if (response.statusCode != 201) {
        console.log("Error posting weather information.");
        console.log(response.statusCode);
        console.log(err);
      }
    });
  });
};

// Ensure we can parse JSON when listening to requests
app.use(_bodyParser2.default.json());

app.get('/', function (req, res) {
  res.send('IBM Watson Workspace weather bot is alive and happy!');
});

// This is callback URI that Watson Workspace will call when there's a new message created
app.post('/webhook', validateEvent, function (req, res) {

  // Check if the first part of the message is '@weather'.
  // This lets us "listen" for the '@weather' keyword.
  if (req.body.content.indexOf(webhookKeyword) != 0) {
    ignoreMessage(res);
    return;
  }

  // Send status back to Watson Work to confirm receipt of message
  res.status(200).end();

  // Id of space where outbound event originated from.
  var spaceId = req.body.spaceId;

  // Parse zipcode from message body.
  // Expected format: <keyword> <zipcode>
  var zc = req.body.content.split(' ')[1];
  console.log('Getting weather for zipcode: \'' + zc + '\'');

  var cityState = _zipcode2.default.lookup(zc);

  // If lookup fails, send failure message to space.
  if (!cityState) {
    sendMessage(spaceId, zipCodeError(zc));
    return;
  }

  console.log('Looking up weather for: ' + cityState[0] + ', ' + cityState[1]);

  var opts = {
    city: cityState[0],
    state: cityState[1]
  };

  client.conditions(opts, function (err, data) {

    // If error, send message to Watson Workspace with failure message
    if (err) {
      sendMessage(spaceId, failMessage, res);
      return;
    }

    console.log("Posting current weather conditions back to space");
    sendMessage(spaceId, successMessage(data.display_location.full, data.weather, data.temperature_string, data.wind_string, data.forecast_url));
    return;
  });
});

// Kickoff the main process to listen to incoming requests
app.listen(process.env.PORT || 3000, function () {
  console.log('Weather app is listening on the port');
});