var express = require('express');
var WebSocketServer = require('ws').Server;
var socketIds = 0;
var streamData = {
  tweetsByTicker: require('./tweets').data,
  tickerUpdates: require('./ticker-updates').data,
  newsForTicker: require('./ticker-news').data
};

app = express();
app.use(express.static(__dirname + '/public'));
app.listen(8000);

var wss = new WebSocketServer({
  port: 8001
});

var subManager = {
  sub: function (ws, intent) {
    this._subscriptions = this._subscriptions || {};
    this._subscriptions[intent.model] = this._subscriptions[intent.model] || {};
    this._subscriptions[intent.model][intent.query] = setInterval(function() {
      try {
        ws.send('newdata:'+intent.model+':'+intent.query+':'+getRandomData(intent.model))
      }
      catch(e) {
        console.log('whatever, clearInterval');
        clearInterval(this._subscriptions[intent.model][intent.query]);
      }
    }, (Math.random() * 2000) + 500);
  },
  unsub: function (ws, intent) {
    try {
      clearInterval(this._subscriptions[intent.model][intent.query]);
    }
    catch (e) {
      console.error('Could not clear subscription', e);
    }
  },
  cleanUpSocket: function (ws) {
  }
};

wss.on('connection', function(ws) {
  ws.id = getUniqueId();
  ws.send('thx for connecting. u shld subscribe to one of my streams of data' +
    'Such as, tweetsByTicker, newsForTicker, tickerUpdates\n' +
    'Subscribe by: ws.send("sub:tickerUpdates:goog")');
  ws.on('message', function(msg) {
    var intent = parseMsg(msg);
    console.log(intent);
    if (intent) {
      subManager[intent.action](ws, intent);
    }
    else {
      console.log('msg received: ', msg);
      ws.send('thx for ur msg');
    }
  });

  function parseMsg(msg) {
    var parsed = /(sub|unsub):([a-zA-Z]*):([a-zA-Z]*)/.exec(msg);
    return parsed && parsed.length === 4 ? {
      action: parsed[1],
      model: parsed[2],
      query: parsed[3]
    } : undefined;
  }
});

function getRandomData (model) {
  return JSON.stringify(streamData[model][Math.floor(Math.random() * streamData[model].length)]);
}

function getUniqueId() {
  return socketIds++;
}

