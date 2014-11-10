angular.module('tickerApp', ['ngRoute']).
  config(function($routeProvider) {
    $routeProvider.when('/', {
      controller: 'HomeController',
      templateUrl: 'home.html'
    }).
    when('/detail/:id', {
      controller: 'DetailController',
      templateUrl: 'detail/detail.html'
    }).
    otherwise({redirectTo: '/'});
  }).
  factory('socketParser', function() {
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
  }).
  service('Stocks', function() {
    this.stocks = [{
      ticker: 'FB',
      name: 'Facebook'
    },
    {
      ticker:  'GOOG',
      name: 'Google'
    },
    {
      ticker:  'GOOGL',
      name: 'Google'
    },
    {
      ticker: 'NFLX',
      name: 'Netflix'
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
  }).
  controller('HomeController', ['$scope', 'Stocks', 'socketParser', function($scope, Stocks, socketParser) {
    $scope.stocks = Stocks.get();
    var socket = new WebSocket('ws://localhost:8001');
    socket.onopen = function() {
      console.log('opened');
      socket.send('hi from client');
      socket.send('sub:tickerUpdates:goog');
    };

    socket.onmessage = function(msg) {
      console.log('msg received from server: ', msg.data);
      var parsed = socketParser(msg.data);
      if (parsed) {
        $scope.$apply(function() {
          $scope[parsed.model] = $scope[parsed.model] || {};
          $scope[parsed.model][parsed.query] = $scope[parsed.model][parsed.query] || [];
          $scope[parsed.model][parsed.query].push(parsed.data);
        });
      }
    };

  }]).
  controller('DetailController', ['$scope', '$routeParams', 'Stocks', function($scope, $routeParams, Stocks){
    $scope.stock = Stocks.getStockByTicker($routeParams.id);
  }]);
