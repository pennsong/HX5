var jwt = require('jwt-simple');
var moment = require('moment');
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

        db.User.findOne(
            {
                username: req.query.username,
                password: req.query.password
            },
            //'username',
            function(err, user) {
                if (err) {
                    res.statusCode = 500;
                    res.json({result: '用户查询错误!', detail: err});
                }
                else{
                    if (user == null)
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
                            iss: user.id,
                            exp: expires
                        }, app.get('jwtTokenSecret'));

                        res.json({
                            token : token,
                            expires: expires,
                            user: user
                        });
                    }
                }
            });
    });

    app.all("*", function(req, res, next){
        var token = (req.body && req.body.access_token)
            || (req.query && req.query.access_token)
            || req.headers['x-access-token'];

        if (token) {
            try {
                var decoded = jwt.decode(token, app.get('jwtTokenSecret'));
                // handle token here
                db.User.findOne(
                    {
                        _id: decoded.iss
                    },
                    function(err, user) {
                        if (err) {
                            res.statusCode = 500;
                            res.json({result: '用户查询错误!', detail: err});
                        }
                        else{
                            if (user == null)
                            {
                                // user not found
                                res.statusCode = 401;
                                res.json({result: '用户不存在!'});
                            }
                            else
                            {
                                req.user = user;
                                next();
                            }
                        }
                    }
                );
            } catch (err) {
                res.statusCode = 401;
                res.json({result: '解析令牌错误!', detail: err.toString()});
            }
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