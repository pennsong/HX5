var jwt = require('jwt-simple');
var moment = require('moment');
var async = require("async");

function apiRouter(app, db)
{
    app.set('jwtTokenSecret', 'ppToken');

    app.get('/login', function(req, res) {
        if (!(req.query.username && req.query.password))
        {
            res.statusCode = 400;
            res.json({result: '用户名和密码都必须填写!'});
            return;
        }

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
                function(next){
                    db.User.findOne(
                        {
                            username: req.query.username,
                            password: req.query.password
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
                    else
                    {
                        //用户名密码正确
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
                                    token: token
                                }
                            },
                            function (err, numberAffected, raw)
                            {
                                next(err, token);
                            }
                        );
                    }
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

    app.get('/', function(req, res) {
        res.render('index', { title: 'api' + req.user });
    });

    return app;
}

module.exports = apiRouter;