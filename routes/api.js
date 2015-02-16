var jwt = require('jwt-simple');
var moment = require('moment');
var async = require("async");
var http = require('http');

function apiRouter(app, db)
{
    app.set('jwtTokenSecret', 'ppToken');

    function login(req, res){
        var loginResult = {};

        function finalCallback(err, result) {
            if (err){
                res.statusCode = 400;
                res.json({result: err.toString()});
            }
            else{
                res.json(result);
            }
        }

        async.waterfall([
                function(next){
                    //验证用户名密码
                    db.User.findOne(
                        {
                            username: req.body.username,
                            password: req.body.password
                        },
                        next
                    );
                },
                function(result, next)
                {

                    if (result == null)
                    {
                        // user not found
                        res.statusCode = 401;
                        res.json({result: '用户名或密码错误!'});
                    }
                    //用户名密码正确
                    else
                    {
                        //更新cid和token
                        var expires = moment().add(100, 'year').valueOf();
                        var token = jwt.encode({
                            iss: result.id,
                            exp: expires
                        }, app.get('jwtTokenSecret'));
                        db.User.update(
                            { _id: result.id },
                            {
                                $set:
                                {
                                    token: token,
                                    cid: req.body.cid
                                }
                            },
                            function (err, numberAffected, raw)
                            {
                                loginResult.token = token;
                                next(err, null);
                            }
                        );
                    }
                },
                function(result, next)
                {
                    //get meets
                    getMeets(req.body.username, next);
                },
                function(result, next)
                {
                    loginResult.meets = result;
                    //get friends
                    getFriends(req.body.username, next);

                },
                function(result, next)
                {
                    loginResult.friends = result;
                    next(null, loginResult);
                }
            ],
            finalCallback
        );
    }

    function getMeets(username, next){
        db.Meet.find(
            {
                $or: [
                    {"creater.username": username},
                    {"target.username": username}
                ],
                status: {$ne:"成功"}
            })
            .sort('-_id')
            .exec(next);
    }


    function getFriends(username, next){
        db.Friend.find(
            {
                $or: [
                    {"creater.username": username},
                    {"target.username": username}
                ]
            })
            .sort('-_id')
            .exec(next);
    }

    function searchLoc(keyword, lng, lat, callback){
        async.waterfall([
                function(next)
                {
                    var ak = "F9266a6c6607e33fb7c3d8da0637ce0b";
                    var data = "ak=" + ak;
                    data += "&coords=" + lng + "," + lat;

                    var options = {
                        host: 'api.map.baidu.com',
                        port: 80,
                        path: '/geoconv/v1/?' + data
                    };
                    http.get(options, function(res, data) {
                        res.setEncoding('utf8');
                        result = "";
                        res.on("data", function(chunk) {
                            result += chunk;
                        });
                        res.on('end', function () {
                            next(null, JSON.parse(result));
                        });

                    }).on('error', function(err) {
                        next(err, null);
                    });
                },
                function(result, next)
                {
                    var ak = "F9266a6c6607e33fb7c3d8da0637ce0b";
                    var output = "json";
                    var radius = "2000";
                    var scope = "1";
                    var data = "query=" + encodeURIComponent(keyword);
                    data += "&ak=" + ak;
                    data += "&output=" + output;
                    data += "&radius=" + radius;
                    data += "&scope=" + scope;
                    data += "&location=" + "31.209335300000003" + "," + "121.59487019999999";
                    data += "&filter=sort_name:distance";

                    var options = {
                        host: 'api.map.baidu.com',
                        port: 80,
                        path: '/place/v2/search?' + data
                    };

                    http.get(options, function(res, data) {
                        res.setEncoding('utf8');
                        result = "";
                        res.on("data", function(chunk) {
                            result += chunk;
                        });
                        res.on('end', function () {
                            callback(null, JSON.parse(result));
                        });
                    }).on('error', function(e) {
                        callback(e);
                    });
                }
            ],
            callback
        );
    }


    app.post('/login', function(req, res) {
        if (!(req.body.username && req.body.password))
        {
            res.statusCode = 400;
            res.json({result: '用户名和密码都必须填写!'});
            return;
        }

        login(req, res);
    });

    app.post('/register', function(req, res) {
        function finalCallback(err, result) {
            if (err){
                res.statusCode = 400;
                res.json({result: err.toString()});
            }
            else{
                res.json({result: result});
            }
        }

        async.waterfall([
                function(next)
                {
                    db.User.create(
                        {
                            username: req.body.username,
                            password: req.body.password,
                            nickname: req.body.nickname,
                            token: 'fake',
                            'specialInfo.sex': req.body.sex
                        },
                        next
                    );
                },
                function(result, next)
                {
                    login(req, res);
                }
            ],
            finalCallback
        );
    });

    app.all("*", function(req, res, next){
        var token = (req.body && req.body.access_token)
            || (req.query && req.query.access_token)
            || req.headers['x-access-token'];

        if (token) {
            //var decoded = jwt.decode(token, app.get('jwtTokenSecret'));
            // handle token here
            db.User.findOne(
                {
                    token: token
                },
                function(err, user) {
                    if (err) {
                        res.statusCode = 500;
                        res.json({result: '令牌查询错误!', detail: err});
                    }
                    else{
                        if (user == null)
                        {
                            // user not found
                            res.statusCode = 401;
                            res.json({result: '请重新登陆!'});
                        }
                        else
                        {
                            req.user = user;
                            next();
                        }
                    }
                }
            );
        } else {
            res.statusCode = 401;
            res.json({result: '请先登陆!'});
        }
    });

    app.post('/sendMeetCheck', function(req, res) {
        if (req.user.specialInfoTime
            && req.user.specialInfoTime > moment(moment().format('YYYY-MM-DD')).valueOf()
            && req.user.lastLocationTime > moment().add(-5, 'm').valueOf()
            && req.user.lastMeetCreateTime > moment().add(-30, 's').valueOf()
            )
        {
            res.json({result: 'yes'});
        }
        else
        {
            res.json({result: 'no'});
        }
    });

    app.post('/getNearLocation', function(req, res) {
        searchLoc(req.body.keyword, req.user.lastLocation[0], req.user.lastLocation[1], function(err, result){
            if (err)
            {
                res.statusCode = 400;
                res.json({result: '非法请求!'});
            }
            else
            {
                res.json(result);
            }
        });
    });

    app.post('/meetCreateConfirmSearch', function(req, res) {
//        req.body.specialInfo = {
//            sex: '男',
//            hair  : null,
//            glasses : null,
//            clothesType : null,
//            clothesColor : null,
//            clothesStyle : null
//        };
        if (!req.body.specialInfo)
        {
            res.statusCode = 400;
            res.json({result: '非法请求,没有特征信息!'});
            return;
        }

        function finalCallback(err, result) {
            if (err){
                res.statusCode = 400;
                res.json({result: err.toString()});
            }
            else{
                res.json(result);
            }
        }

        var friends;
        var createMeetTargets;

        async.waterfall([
                function(next)
                {
                    //找本人发送待回复的meet中的目标
                    db.Meet.find(
                        {
                            "creater.username": req.user.username,
                            status: '待回复'
                        })
                        .select('target.username')
                        .sort('-_id')
                        .exec(next);
                },
                function(result, next)
                {
                    createMeetTargets = result;
                    //get friends
                    getFriends(req.user.username, next);
                },
                function(result, next)
                {
                    friends = result.map(function(item){
                        if (item.creater.username == req.user.username)
                        {
                            return item.target.username
                        }
                        else
                        {
                            return item.creater.username
                        }

                    });
                    next(null, null);
                },
                function(result, next)
                {
                    db.User.aggregate(
                        [
                            {
                                $project:
                                {
                                    score:
                                    {
                                        $add:
                                            [
                                                {
                                                    $cond:
                                                        [
                                                            {
                                                                $eq: [ "$specialInfo.sex", req.body.specialInfo.sex ]
                                                            },
                                                            1,
                                                            0
                                                        ]
                                                },
                                                {
                                                    $cond:
                                                        [
                                                            {
                                                                $eq: [ "$specialInfo.hair", req.body.specialInfo.hair ]
                                                            },
                                                            1,
                                                            0
                                                        ]
                                                },
                                                {
                                                    $cond:
                                                        [
                                                            {
                                                                $eq: [ "$specialInfo.glasses", req.body.specialInfo.glasses ]
                                                            },
                                                            1,
                                                            0
                                                        ]
                                                },
                                                {
                                                    $cond:
                                                        [
                                                            {
                                                                $eq: [ "$specialInfo.clothesType", req.body.specialInfo.clothesType ]
                                                            },
                                                            1,
                                                            0
                                                        ]
                                                },
                                                {
                                                    $cond:
                                                        [
                                                            {
                                                                $eq: [ "$specialInfo.clothesColor", req.body.specialInfo.clothesColor ]
                                                            },
                                                            1,
                                                            0
                                                        ]
                                                },
                                                {
                                                    $cond:
                                                        [
                                                            {
                                                                $eq: [ "$specialInfo.clothesStyle", req.body.specialInfo.clothesStyle ]
                                                            },
                                                            1,
                                                            0
                                                        ]
                                                }
                                            ]
                                    }
                                }
                            },
                            {
                                $match :
                                {
                                    score : { $gte : 4 }
                                }
                            }
                        ],
                        next
                    );
                }
            ],
            finalCallback
        );
    });



    app.get('/', function(req, res) {
        res.render('index', { title: 'api' + req.user });
    });







    return app;
}

module.exports = apiRouter;