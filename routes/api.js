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

    function sendMeetCheck(req) {
        return true;

        if (req.user.specialInfoTime
            && req.user.specialInfoTime > moment(moment().format('YYYY-MM-DD')).valueOf()
            && req.user.lastLocationTime > moment().add(-5, 'm').valueOf()
            && req.user.lastMeetCreateTime < moment().add(-30, 's').valueOf()
            )
        {
            return true;
        }
        else
        {
            return false;
        }
    };

    function createFriend(creater, target, callback){
        db.Friend.create(
            {
                creater:{
                    username: creater.username,
                    nickname: creater.nickname
                },
                target:{
                    username: target.username,
                    nickname: target.nickname
                }
            },
            //通知双方
            //todo
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
        if (sendMeetCheck(req))
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
        req.body.meetCondition = {};

        req.body.meetCondition.specialInfo = {
            sex: '男',
            hair  : null,
            glasses : null,
            clothesType : null,
            clothesColor : null,
            clothesStyle : null
        };
        req.body.sendLoc = {
            lng: 121.5949949426754,
            lat: 31.209359545138003
        };

        if (!(req.body.meetCondition && req.body.sendLoc))
        {
            res.statusCode = 400;
            res.json({result: '非法请求,没有特征信息或发送地理位置!'});
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
                                $geoNear: {
                                    near: { type: "Point", coordinates: [ Number(req.body.sendLoc.lng), Number(req.body.sendLoc.lat) ] },
                                    distanceField: "lastLocation",
                                    maxDistance: 500,
                                    query: {
//                                        specialInfoTime: {$gt: moment().add(-15, 'm').valueOf()},
                                        "specialInfo.sex":req.body.meetCondition.specialInfo.sex,
                                        username: {$ne: req.user.username, $nin: createMeetTargets.concat(friends)}
                                    },
                                    spherical: true
                                }
                            },
                            {
                                $project:
                                {
                                    username: 1,
                                    specialPic: 1,
                                    score:
                                    {
                                        $add:
                                            [
                                                {
                                                    $cond:
                                                        [
                                                            {
                                                                $eq: [ "$specialInfo.sex", req.body.meetCondition.specialInfo.sex ]
                                                            },
                                                            1,
                                                            0
                                                        ]
                                                },
                                                {
                                                    $cond:
                                                        [
                                                            {
                                                                $eq: [ "$specialInfo.hair", req.body.meetCondition.specialInfo.hair ]
                                                            },
                                                            1,
                                                            0
                                                        ]
                                                },
                                                {
                                                    $cond:
                                                        [
                                                            {
                                                                $eq: [ "$specialInfo.glasses", req.body.meetCondition.specialInfo.glasses ]
                                                            },
                                                            1,
                                                            0
                                                        ]
                                                },
                                                {
                                                    $cond:
                                                        [
                                                            {
                                                                $eq: [ "$specialInfo.clothesType", req.body.meetCondition.specialInfo.clothesType ]
                                                            },
                                                            1,
                                                            0
                                                        ]
                                                },
                                                {
                                                    $cond:
                                                        [
                                                            {
                                                                $eq: [ "$specialInfo.clothesColor", req.body.meetCondition.specialInfo.clothesColor ]
                                                            },
                                                            1,
                                                            0
                                                        ]
                                                },
                                                {
                                                    $cond:
                                                        [
                                                            {
                                                                $eq: [ "$specialInfo.clothesStyle", req.body.meetCondition.specialInfo.clothesStyle ]
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
                },
                function(result, next)
                {
                    //fake图片
                    var needFakeNum = 4 - result.length;
                    if (needFakeNum > 0)
                    {
                        for (var i = 0; i < needFakeNum; i++)
                        {
                            result.push({username: "fake", specialPic: "fake.png"});
                        }
                    }
                    next(null, result);
                }
            ],
            finalCallback
        );
    });

    app.post('/meetCreateConfirmClickFake', function(req, res) {
        function finalCallback(err, result) {
            if (err){
                res.statusCode = 400;
                res.json({result: err.toString()});
            }
            else{
                if (tooManyFake)
                {
                    res.json({result: "连续30秒内选择错误图片,请仔细选择特征图片!"});
                }
                else
                {
                    res.json({result: "请仔细选择特征图片!"});
                }
            }
        }

        var tmpMoment = moment().valueOf();
        var tooManyFake = false;
        async.waterfall([
                function(next)
                {
                    db.User.findOne(
                        {
                            username: req.user.username
                        })
                        .exec(next);
                },
                function(result, next)
                {
                    if (result.lastFakeTime.valueOf() > moment(tmpMoment).add(-30, 's').valueOf())
                    {
                        tooManyFake = true;
                        db.User.where({username: req.user.username})
                            .update({lastMeetCreateTime: tmpMoment}, function(err, result){
                                next(err, result);
                            });
                    }
                    else
                    {
                        next(null, null)
                    }
                },
                function(result, next)
                {
                    db.User.where({username: req.user.username})
                        .update({lastFakeTime: tmpMoment}, next);
                }
            ],
            finalCallback
        );
    });

    app.post('/meetCreateSelectTarget', function(req, res) {
//        req.body.target_username = 't1';
//        req.body.mapLoc = {
//            name : 'tt',
//            location : [2, 2],
//            uid : 'uu'
//        };
//        req.body.specialInfo = {
//            sex: '男',
//            hair  : '',
//            glasses : '',
//            clothesType : '',
//            clothesColor : '',
//            clothesStyle : ''
//        },
//            req.body.personLoc = [2, 2];


        //检查是否满足发meet条件
        if (!sendMeetCheck(req))
        {
            res.statusCode = 400;
            res.json({result: "不满足发邀请条件"});
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

        var eachOther = false;
        var tmpMeet;
        async.waterfall([
            function(next){
                //检查是否是已有朋友
                db.Friend.find(
                    {
                        $or: [
                            {"creater.username": req.user.username, "target.username": target_username},
                            {"creater.username": target_username, "target.username": req.user.username}
                        ]
                    },
                    function(err, result)
                    {
                        if (err){
                            res.statusCode = 400;
                            res.json({result: err.toString()});
                        }
                        else{
                            if (result)
                            {
                                //是现有朋友
                                res.statusCode = 400;
                                res.json({result: '此人已经是你朋友了!'});
                            }
                            else
                            {
                                next(null, null);
                            }
                        }
                    }
                );
            },
            function(result, next){
                //检查是否互发
                db.Meet.findOne(
                    {
                        'creater.username': req.body.target_username,
                        'target.username': req.user.username,
                        status: '待回复'
                    },
                    next
                );
            },
            function(result, next)
            {
                if (result)
                {
                    //互发
                    async.waterfall([
                            function(next)
                            {
                                //建立朋友关系
                                createFriend(result.creater, req.user, next);
                            },
                            function(result, next)
                            {
                                //修改原meet为成功状态
                                db.Meet.findOneAndUpdate(
                                    {_id: tmpMeet.id},
                                    {status: '待回复'},
                                    {},
                                    function(err, result){
                                        next(err, {result: "ok"});
                                    });
                            }
                        ],
                        finalCallback
                    );
                }
                else
                {
                    //无互发
                    async.waterfall([
                            function(next){
                                //查询target
                                db.User.findOne(
                                    {
                                        username: req.body.target_username
                                    },
                                    next
                                );
                            },
                            function(result, next)
                            {
                                //生成meet
                                db.Meet.create(
                                    {
                                        creater: {
                                            username: req.user.username,
                                            nickname: req.user.nickname,
                                            specialPic: req.user.specialPic
                                        },
                                        target: {
                                            username: result.username,
                                            nickname: result.nickname,
                                            specialPic: result.specialPic
                                        },
                                        status: '待回复',
                                        replyLeft: 2,
                                        mapLoc: req.body.mapLoc,
                                        personLoc: req.body.personLoc,
                                        specialInfo: req.body.specialInfo

                                    },
                                    next
                                );
                            },
                            function(result, next)
                            {
                                //通知meet双方
                                //todo

                                //修改最后发送meet时间和最后fake时间
                                db.User.findOneAndUpdate(
                                    {
                                        username: req.user.username
                                    },
                                    {
                                        lastMeetCreateTime: moment().valueOf(),
                                        lastFakeTime: null
                                    },
                                    function(err, result){
                                        next(err, {result: "ok"});
                                    }
                                );
                            }

                        ],
                        finalCallback
                    );
                }
            }
        ]);
    });

    app.post('/meetConfirmSelectTarget', function(req, res) {
        function finalCallback(err, result) {
            if (err){
                res.statusCode = 400;
                res.json({result: err.toString()});
            }
            else{
                res.json(result);
            }
        }

        var eachOther = false;
        var tmpMeet;
        async.waterfall([
            function(next){
                //检查是否是已有朋友
                db.Friend.find(
                    {
                        $or: [
                            {"creater.username": req.user.username, "target.username": target_username},
                            {"creater.username": target_username, "target.username": req.user.username}
                        ]
                    },
                    function(err, result)
                    {
                        if (err){
                            res.statusCode = 400;
                            res.json({result: err.toString()});
                        }
                        else{
                            if (result)
                            {
                                //是现有朋友
                                res.statusCode = 400;
                                res.json({result: '此人已经是你朋友了!'});
                            }
                            else
                            {
                                next(null, null);
                            }
                        }
                    }
                );
            },
            function(result, next)
            {
                //查询target
                db.User.findOne(
                    {
                        username: req.body.target_username
                    },
                    next
                );
            },
            function(result, next){
                //完善meet确认信息
                db.Meet.findOneAndUpdate(
                    {_id: req.body.meetId},
                    {
                        status: '待回复',
                        target: {
                            username: result.username,
                            nickname: result.nickname,
                            specialPic: result.specialPic
                        }
                    },
                    {},
                    next
                );
            },
            function(result, next){
                //检查是否互发
                db.Meet.findOne(
                    {
                        'creater.username': req.body.target_username,
                        'target.username': req.user.username,
                        status: '待回复'
                    },
                    next
                );
            },
            function(result, next)
            {
                if (result)
                {
                    //互发
                    async.waterfall([
                            function(next)
                            {
                                //建立朋友关系
                                createFriend(result.creater, req.user, next);
                            },
                            function(result, next)
                            {
                                //修改对方原meet为成功状态
                                db.Meet.findOneAndUpdate(
                                    {_id: tmpMeet.id},
                                    {status: '待回复'},
                                    {},
                                    next
                                );
                            },
                            function(result, next)
                            {
                                //修改本方原meet为成功状态
                                db.Meet.findOneAndUpdate(
                                    {_id: req.body.meetId},
                                    {
                                        status: '待回复'
                                    },
                                    {},
                                    function(err, result){
                                        next(err, {result: "ok"});
                                    });
                            }
                        ],
                        finalCallback
                    );
                }
                else
                {
                    finalCallback(null, {result: "ok"});
                }
            }
        ]);
    });

    app.post('/meetCreateNoTarget', function(req, res) {
//        req.body.specialInfo = {
//            sex: '男',
//            hair  : '',
//            glasses : '',
//            clothesType : '',
//            clothesColor : '',
//            clothesStyle : ''
//        };
//
//        req.body.mapLoc = {
//            name : 'tt',
//            location : [2, 2],
//            uid : 'uu'
//        };

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
                function(next)
                {
                    //生成meet
                    db.Meet.create(
                        {
                            creater: {
                                username: req.user.username,
                                nickname: req.user.nickname,
                                specialPic: req.user.specialPic
                            },
                            status: '待确认',
                            replyLeft: 2,
                            mapLoc: req.body.mapLoc,
                            personLoc: req.user.lastLocation,
                            specialInfo: req.body.specialInfo
                        },
                        next
                    );
                },
                function(result, next)
                {
                    //修改最后发送meet时间
                    db.User.findOneAndUpdate(
                        {
                            username: req.user.username
                        },
                        {
                            lastMeetCreateTime: moment().valueOf()
                        },
                        next
                    );
                },
                function(result, next)
                {
                    //通知附近没有specialInfo的人
                    db.User
                        .where('lastLocation').near({
                            center: req.user.lastLocation,
                            maxDistance: 500,
                            spherical: true })
                        .where('username').ne(req.user.username)
                        .where('lastLocationTime').gt(moment().add(-5, 'm').valueOf())
                        .where('specialInfoTime').gt(moment(moment().format('YYYY-MM-DD')).valueOf())
                        .exec( function(err, result)
                        {
                            if (err)
                            {
                                res.statusCode = 400;
                                res.json({result: err.toString()});
                            }
                            else
                            {
                                //console.log(result.map(function(item){return item.username}));
                                //通知result中的人
                                //todo
                                res.json({result: "ok"});
                            }
                        });
                }
            ],
            finalCallback
        );
    });

    app.post('/updateSpecialInfo', function(req, res) {
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
                function(next)
                {
                    db.User.findOneAndUpdate(
                        {
                            username: req.user.username
                        },
                        {
                            specialInfo: req.body.specialInfo,
                            specialPic : req.body.specialPic,
                            specialInfoTime : moment().valueOf()
                        },
                        next
                    );
                },
                function(result, next)
                {
                    db.Meet
                        .where('personLoc').near({
                            center: req.user.lastLocation,
                            maxDistance: 500,
                            spherical: true })
                        .where('creater.username').ne(req.user.username)
                        .where('status').equals('待确认')
                        .exec( function(err, result)
                        {
                            if (err)
                            {
                                res.statusCode = 400;
                                res.json({result: err.toString()});
                            }
                            else
                            {
                                console.log(result.map(function(item){return item.username}));
                                //通知result中的人
                                //todo
                                res.json({result: "ok"});
                            }
                        });
                }
            ],
            finalCallback
        );
    });

    app.post('/uploadSpecialPic', function(req, res){
        res.json({result: req.files.avatar.name});
    });

    app.post('/meetReplySearch', function(req, res) {
        if (!(req.body.meetId))
        {
            res.statusCode = 400;
            res.json({result: '非法请求,没有meetId!'});
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

        var meetCreaterUsername;
        var meetCreaterSpecialPic;
        async.waterfall([
                function(next)
                {
                    db.Meet.findById(req.body.meetId).exec(next);
                },
                function(result, next)
                {
                    if (result == null)
                    {
                        res.statusCode = 400;
                        res.json({result: '没找到对应meet'});
                    }
                    else if (result.replyLeft <= 0)
                    {
                        res.statusCode = 400;
                        res.json({result: '没有回复次数了'});
                    }
                    else
                    {
                        db.Meet.findOneAndUpdate(
                            {_id: req.body.meetId},
                            {
                                $inc:
                                {
                                    replyLeft: -1
                                }
                            },
                            next
                        );
                    }
                },
                function(result, next)
                {
                    meetCreaterUsername = result.creater.username;
                    meetCreaterSpecialPic = result.specialPic;
                    //检查特征信息是否符合
                    var score = 0;
                    if (result.specialInfo.hair == req.body.meetCondition.specialInfo.hair)
                    {
                        score++;
                    }

                    if (result.specialInfo.glasses == req.body.meetCondition.specialInfo.glasses)
                    {
                        score++;
                    }

                    if (result.specialInfo.clothesType == req.body.meetCondition.specialInfo.clothesType)
                    {
                        score++;
                    }

                    if (result.specialInfo.clothesColor == req.body.meetCondition.specialInfo.clothesColor)
                    {
                        score++;
                    }

                    if (result.specialInfo.clothesStyle == req.body.meetCondition.specialInfo.clothesStyle)
                    {
                        score++;
                    }
                    if (result.specialInfo.sex != req.body.meetCondition.specialInfo.sex)
                    {
                        score = 0;
                    }

                    if (score <= 4)
                    {
                        res.statusCode = 400;
                        res.json({result: '特征信息错误!'});
                    }
                    else
                    {
                        next(null, null);
                    }
                },
                function(result, next)
                {
                    //fake图片
                    var needFakeNum = 4 - 1;
                    result.push({username: meetCreaterUsername, specialPic: meetCreaterSpecialPic});
                    if (needFakeNum > 0)
                    {
                        for (var i = 0; i < needFakeNum; i++)
                        {
                            result.push({username: "fake", specialPic: "fake.png"});
                        }
                    }
                    next(null, result);
                }
            ],
            finalCallback
        );
    });

    app.post('/meetReplySelectTarget', function(req, res) {
        if (!(req.body.meetId && req.body.creater_username))
        {
            res.statusCode = 400;
            res.json({result: '非法请求,没有meetId或目标用户!'});
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

        async.waterfall([
                function(next)
                {
                    db.Meet.findById(req.body.meetId).exec(next);
                },
                function(result, next)
                {
                    if (result == null)
                    {
                        res.statusCode = 400;
                        res.json({result: '没找到对应meet'});
                    }
                    else
                    {
                        if (result.creater.username == req.body.creater_username)
                        {
                            //回复成功
                            //修改原meet为成功状态
                            db.Meet.findOneAndUpdate(
                                {_id: req.body.meetId},
                                {status: '成功'},
                                {},
                                function(err, result){
                                    if (err)
                                    {
                                        next(err, null);
                                    }
                                    else
                                    {
                                        //生成朋友
                                        createFriend(result.creater, req.user, next);
                                    }
                                });
                        }
                        else
                        {
                            //回复错误
                            res.statusCode = 400;
                            res.json({result: '回复了错误对象'});
                        }
                    }
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