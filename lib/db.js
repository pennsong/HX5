var mongoose = require('mongoose');
mongoose.connect('mongodb://localhost/HX5');
var db = mongoose.connection;
db.on('error', console.error.bind(console, 'connection error:'));
db.once('open', function (callback) {
    console.log("db connect open!");
});

var UserSchema = mongoose.Schema({
    username: { type: String, required: true, minlength: 6, maxlength: 20, unique: true },
    password: { type: String, required: true },
    nickname: { type: String, required: true, minlength: 2, maxlength: 20 },
    token: { type: String, required: true },
    cid: String,
    specialInfo: {
        sex: { type: String, enum: ['男', '女'], required: true },
        hair  : String,
        glasses : String,
        clothesType : String,
        clothesColor : String,
        clothesStyle : String
    },
    specialPic : String,
    specialInfoTime : Date,
    lastLocation : {
        type: [Number],
        default: [0, 0],
        index: '2dsphere'
    },
    lastLocationTime : Date,
    lastMeetCreateTime : Date,
    lastFakeTime : Date
});

var MeetSchema = mongoose.Schema({
    creater: {
        username: { type: String, required: true },
        nickname: String,
        specialPic: String
    },
    target: {
        username: String,
        nickname: String,
        specialPic: String
    },
    status : { type: String, enum: ['待确认', '待回复', '成功'], required: true },
    replyLeft : { type: Number, required: true },
    mapLoc : {
        name : { type: String, required: true },
        location : {
            type: [Number],
            required: true
        },
        uid : { type: String, required: true }
    },
    personLoc : {
        type: [Number],
        default: [0, 0],
        required: true,
        index: '2dsphere'
    },
    specialInfo: {
        sex: { type: String, enum: ['男', '女'], required: true },
        hair  : String,
        glasses : String,
        clothesType : String,
        clothesColor : String,
        clothesStyle : String
    }
});

var FriendSchema = mongoose.Schema({
    creater: {
        username: { type: String, required: true },
        nickname: { type: String, required: true }
    },
    target: {
        username: { type: String, required: true },
        nickname: { type: String, required: true }
    },
    messages : [{
        //username
        from : { type: String, required: true },
        //username
        to : { type: String, required: true },
        content: { type: String, required: true },
        time: { type: Date, required: true }
    }]

});

var db;
db.User = mongoose.model('User', UserSchema);
db.Meet = mongoose.model('Meet', MeetSchema);
db.Friend = mongoose.model('Friend', FriendSchema);

module.exports = db;