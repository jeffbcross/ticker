var app = angular.module('tickerApp', ['ngRoute']).
  config(function($routeProvider) {
    $routeProvider.when('/', {
      controller: 'HomeController',
      templateUrl: 'home.html',
    }).
    when('/detail/:id', {
      controller: 'DetailController',
      templateUrl: 'detail/detail.html'
    }).
    otherwise({redirectTo: '/'});
  });

app.factory('socketParser', function() {
  return function parseMsg(msg) {
    console.log('parsing', msg);
    var parsed = /(newdata):([a-zA-Z]*):([a-zA-Z]*):(.*)/.exec(msg);
    console.log('evaluated', parsed);

    return parsed && parsed.length === 5 ? {
      model: parsed[2],
      query: parsed[3],
      data: JSON.parse(parsed[4])
    } : undefined;
  }
});

app.service('Stocks', function() {
  this.stocks = [{
    ticker: 'FB',
    name: 'Facebook',
    subscribe: false,
  },
  {
    ticker:  'GOOG',
    name: 'Google',
    subscribe: true,
  },
  {
    ticker:  'GOOGL',
    name: 'Google',
    subscribe: false,
  },
  {
    ticker: 'NFLX',
    name: 'Netflix',
    subscribe: false,
  }];

  this.stocksMap = this.stocks.reduce(function(prev, curr) {
    prev[curr.ticker] = curr;
    return prev;
  }, {});

  this.getStockByTicker = function (ticker) {
    return this.stocksMap[ticker];
  };

  this.get = function() {
    return this.stocks;
  }
});

app.factory('WebSocket', ['$window', function($window) {
  return $window.WebSocket;
}]);

app.service('stockTicker', ['WebSocket', '$q', 'socketParser', '$rootScope', function(WebSocket, $q, socketParser, $rootScope){ 
  function StockTicker() {
    this.sendOnConnect = [];
    this.messageHandlers = [];
    this._connectedDeferred = $q.defer();
    this.socket = new WebSocket('ws://localhost:8001');
    this.socket.onopen = this._socketOpen.bind(this);
    this.socket.onmessage = this._socketMessage.bind(this);
    this.socket.onclose = this._socketClose.bind(this);
  }

  StockTicker.prototype = {
    _socketOpen: function(){
      this._connectedDeferred.resolve();
      this.onopen();
      while(this.sendOnConnect && this.sendOnConnect.length > 0) {
        var toSend = this.sendOnConnect.shift();
        this.send(toSend);
      }
    },

    _socketMessage: function(e){
      var parsed = socketParser(e.data);
      if(parsed) {
        $rootScope.$apply(function() {
          this.onmessage(parsed.model, parsed.query, parsed.data, e);
        }.bind(this));
      }
    },

    _socketClose: function(){
      this.onclose();
    },

    send: function (data) {
      if(this.socket.readyState !== WebSocket.OPEN) {
        this.sendOnConnect.push(data);
      } else {
        var msg = typeof data === 'string' ? data : JSON.stringify(data);
        this.socket.send(msg);
      }
    },

    subscribe: function(model, query) {
      this.send('sub:' + model + ':' + query);
    },

    unsubscribe: function(model, query) {
      console.log('send: "unsub:' + model + ':' + query +'"');
      this.send('unsub:' + model + ':' + query);
    },

    connected: function() {
      return this._connectedDeferred.promise;
    },

    onmessage: angular.noop,

    onclose: angular.noop,

    onopen: angular.noop,
  };

  return new StockTicker();
}]);

app.controller('HomeController', ['$scope', 'Stocks', 'stockTicker', function($scope, Stocks, stockTicker) {
  $scope.stocks = Stocks.get();
  var socket = new WebSocket('ws://localhost:8001');
  
  $scope.toggleSubscription = function(stock) {
    if(stock.subscribe) {
      stockTicker.subscribe('tickerUpdates', stock.ticker);
    } else {
      stockTicker.unsubscribe('tickerUpdates', stock.ticker);
    }
  }

  stockTicker.onmessage = function(model, query, data, e) {
    $scope[model] = $scope[model] || {};
    $scope[model][query] = $scope[model][query] || [];
    $scope[model][query].push(data);
  };

  $scope.stocks.forEach(function(stock) {
    if(stock.subscribe) {
      stockTicker.subscribe('tickerUpdates', stock.ticker);
    }
  });
}]);

app.controller('DetailController', ['$scope', '$routeParams', 'Stocks', function($scope, $routeParams, Stocks){
  $scope.stock = Stocks.getStockByTicker($routeParams.id);
}]);
