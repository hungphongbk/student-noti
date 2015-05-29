var express = require('express');
var deferred=require('deferred');
var router = express.Router();
var util=require('../routes/bknoti.utility.js');
var jsdom=require('jsdom');
var request=require('request');
var gcm=require('android-gcm');
var sqlite3=require('sqlite3').verbose();
var path=require('path');
var spawn=require('child_process').spawn;

var main_uri='http://www.aao.hcmut.edu.vn/image/data/Tra_cuu/';
var vnese=/([\s\wÀÁÂÃÈÉÊÌÍÒÓÔÕÙÚĂĐĨŨƠàáâãèéêìíòóôõùúăđĩũơƯĂẠẢẤẦẨẪẬẮẰẲẴẶẸẺẼỀỀỂ ưăạảấầẩẫậắằẳẵặẹẻẽềềểỄỆỈỊỌỎỐỒỔỖỘỚỜỞỠỢỤỦỨỪễệỉịọỏốồổỗộớờởỡợụủứừỬỮỰỲỴÝỶỸửữựỳỵỷỹ]+)/;

var android_gcm_key='AIzaSyCrI9ElE18DxYrVUJl5PDHioYBTNuIDmwI';
var gcmObj=new gcm.AndroidGcm(android_gcm_key);

var bknotidb=new util.BKNOTIDB();

var GOOGLEAPIS=(function(){
    var google=require('googleapis');
    var calendar=new google.calendar("v3");
    var OAuth2Client=google.auth.OAuth2;

    var PARAMS={
        CLIENT_ID:'59729206286-t82potpmklil2m1auurlimhgfhc0n075.apps.googleusercontent.com',
        CLIENT_SECRET:'p3IRJzMrldM25ufAIbJJHpMs',
        REDIRECT_URL:'http://hungphongbk.ddns.net:3000/bk/googleapi/authUrl',
        API_KEY:'AIzaSyCrI9ElE18DxYrVUJl5PDHioYBTNuIDmwI,',
        SCOPE:'https://www.googleapis.com/auth/calendar'
    };
    var oauth2Client=new OAuth2Client(PARAMS.CLIENT_ID,PARAMS.CLIENT_SECRET,PARAMS.REDIRECT_URL);
    var cls=function(){ };
    function getGoogleApiClientSecret(req,res){
        util.success(res,PARAMS);
    }
    function getAuthToken(req,res){
        if (typeof req.query['code'] === 'undefined') {
            var url = oauth2Client.generateAuthUrl({
                access_type: 'offline',
                scope: PARAMS.SCOPE,
                state: req.query['redirect2']||'None'
            });
            util.success(res, {authUrl: url});
        }
        else {
            oauth2Client.getToken(req.query['code'],function(err,token){
                //oauth2Client.setCredentials(token);
                token['clientId']=PARAMS.CLIENT_ID;
                token['clientSecret']=PARAMS.CLIENT_SECRET;
                //init calendar API
                //rewrite calendar.dat
                var fs=require('fs');
                var p=path.resolve(__dirname,'../public/scripts/calendar.dat');
                fs.writeFile(p,JSON.stringify(token));
                var redr=req.query['state']||'';
                if(redr.length>0){
                    res.redirect(redr);
                }
                else util.success(res,{token:token});
            });
        }
    }
    cls.prototype.authorized=function(req,res){

    };
    var mappings={
        'clientsecret': getGoogleApiClientSecret,
        'authUrl': getAuthToken
    };
    cls.prototype.mapping=function(req,res){
        var type=req.params['type'];
        mappings[type](req,res);
    };

    return cls;
})();
var googleapis=new GOOGLEAPIS();

function testmodule(req,res,next){
    //util.success(res,{title:'Success',content:'BK Noti API worked'});
    search('xem_tkb').then(function($){
        util.success(res,
            {
                title:'Success',
                content:'BK Noti API worked',
                example:$('title').text()
            });
    });
}
function testajax(req,res,next){
    search('xem_tkb',
        {
            'HOC_KY':'20142',
            'mssv':'51202744'
        }
    ).then(function($){
        util.success(res,
            {
                title:'Success',
                content:'BK Noti API worked',
                example:$('font[color="#3300CC"]').text()
                //example:$('body').html()
            });
    });
}
//send noti functions

var BKUTIL=(function(db){
    function search(rellink,data){
        var dfd=new deferred();
        var postdata={
            uri:main_uri+rellink,
            method:"GET"
        };
        if (typeof data!=='undefined') {
            data['image']='»Xem';

            postdata["method"] = "POST";
            postdata["form"] = data;
            postdata["header"] = {
                'Content-Type': 'application/x-www-form-urlencoded',
                'Content-Length': JSON.stringify(data).length
            }
        }
        //console.log(postdata);
        request(
            postdata,
            function(err,resp,body){
                console.log(err);
                if (!err) console.log(resp.statusCode);
                if (err && resp && resp.statusCode !== 200) {
                    console.log('Error when contacting ' + main_uri);
                    dfd.reject('Error when contacting ' + main_uri);
                } else jsdom.env({
                    html: body,
                    scripts: ['http://code.jquery.com/jquery-1.11.2.min.js'],
                    done: function (err, window) {
                        if (err) {
                            console.log('ERROR WHEN CRAWLING HTML: ', err);
                            dfd.reject(err);
                        } else {
                            console.log('CRAWLING COMPLETED')
                            dfd.resolve(window.jQuery);
                        }
                    }
                });
            }
        );
        return dfd.promise();
    }
    function downloadSemesterList($){
        var dfd=new deferred();
        var results=$('select[name="HOC_KY"]>option').get().map(function(e){
            return $(e).val();
        });
        dfd.resolve(results);
        return dfd.promise();
    }


    var cls=function(){ };
    var downloadMap={};
    var postMap={};

    cls.prototype.GETLIST_ROUTE=function(req,res){
        if (typeof req.query.stu === 'undefined')
            util.failed(res,'\'stu\' field cannot be null!' );

        var type = req.params.type;
        var stu = req.query.stu;
        var dfd=new deferred();
        setTimeout(function(){
            dfd.reject('Connection timeout');
        },10000);
        downloadMap[type](stu,req,res).then(function(rs){
            dfd.resolve(rs);
        });

        dfd.promise.then(function(rs){
            util.success(res,rs);
        },function(err){
            util.failed(res,err);
        });
    };
    cls.prototype.POSTLIST_ROUTE=function(req,res){
        if (typeof req.query.stu === 'undefined')
            util.failed(res,'\'stu\' field cannot be null!' );
        if (typeof req.query.action==='undefined')
            util.failed(res,'\'action\' field cannot be null!');

        var type=req.params.type;
        var action=req.query.action;
        var stu = req.query.stu;

        postMap[type][action](stu,req,res).then(function(rs){
            util.success(res,rs);
        });
    };
    cls.prototype.downloadStuName=function(stu,req,res){
        return db.getStudentName(stu);
    };
    cls.prototype.downloadScheduleList=function(stu,req,res){
        var byWeek=req.query.byWeek || 0;
        var dfd=new deferred();
        var gettkb=function(){
            return search('xem_tkb')
                .then(downloadSemesterList)
                .then(function(sems){
                    return search('xem_tkb',{
                        'HOC_KY':sems[0],
                        'mssv':stu
                    });
                })
                .then(function($){
                    var semester=$('select[name="HOC_KY"]>option').first().attr('value');
                    //var semester='20142';
                    var property = ['ID', 'Name', 'Group', 'WeekDay', 'Period', 'Room', 'Weeks'];
                    var items = [];
                    $('table[align="left"] tr:not(:first-child)').each(function (i, e) {
                        var obj = {};
                        $(this).children().each(function (_i, _e) {
                            obj[property[_i]] = $(this).text();
                        });
                        items.push(obj);
                    });
                    items=util.groupBy(items,['ID','Name','Group']);
                    return ({
                        StudentID:stu,
                        SemesterCode:semester,
                        Items:items
                    });
                }).then(function(rs){
                    return db.setTKB(rs);
                });
        };
        db.getTKB(stu).then(function(rs){
            return rs;
        },gettkb).then(function(rs){
            if (!byWeek) return rs;
            else return db.getTKB_ByWeek(rs);
        }).then(function(rs){
            dfd.resolve(rs);
        });
        return dfd.promise();
    };
    cls.prototype.downloadExamList=function(stu,req,res){
        console.log(stu);
        var dfd=new deferred();
        console.log('what the duck?');
        search('xem_lt')
            .then(downloadSemesterList)
            .then(function(sems){
                return search('xem_lt',{
                    'HOC_KY':sems[0],
                    'mssv':stu
                });
            })
            .then(function($){
                var semester = $('select[name="HOC_KY"]>option').first().attr('value');
                //var semester='20142';
                var property = ['ID', 'Name', 'Group', 'MidDay', 'MidTime', 'MidRoom', 'FinalDay', 'FinalWeek', 'FinalRoom'];
                var items = [];
                $('table[align="left"] tr:nth-child(n+3)').each(function (i, e) {
                    var obj = {};
                    $(this).children().each(function (_i, _e) {
                        obj[property[_i]] = $(this).text();
                    });
                    items.push(obj);
                });
                dfd.resolve({
                    SemesterCode: semester,
                    Items: items
                });
            });
        return dfd.promise();
    };

    cls.prototype.syncTKBwithGGCalendarApi=function(stu,req,res){
        console.log(req.body);
        if (typeof req.body['mail']==='undefined')
            util.failed(res,'Missing \'mail\' field!');
        var mail=req.body['mail'];
        var noti=req.body['notification']||0;
        var dfd=new deferred();

        var scriptpath=path.resolve(__dirname,'../public/scripts/ggcalendar.py');
        var py=spawn('python',[scriptpath,'--id',stu,'--mail','primary']);
        var succeeded=true;
        py.stderr.on('data', function (data) {
            console.log(data.toString());
            succeeded=false;
        });
        py.stdout.on('data',function(data){
            console.log(data.toString());
        });
        setTimeout(function(){
            if(succeeded){
                dfd.resolve({
                    'status':'OK',
                    'message':'The syncing between your HCMUT timetable and Google Calendar will be completed soon!'
                });
            } else dfd.reject();
        },5000);
        py.on('close',function(code){
            console.log('COMPLETED!');
        });
        return dfd.promise();
    };
    downloadMap = {
        'name': cls.prototype.downloadStuName,
        'tkb': cls.prototype.downloadScheduleList,
        'lt': cls.prototype.downloadExamList
    };
    postMap={
        'tkb': {
            'upload_all':cls.prototype.syncTKBwithGGCalendarApi
        }
    };
    return cls;
})(bknotidb);
var bkutil=new BKUTIL();

var BKNotiMobileService=(function(){
    var def={};
    def.regDevice=function(req,res){
        var id=req.body.regId;
        console.log(id);
        var devices=BKNOTIDB.db.collection('devices',function(err,col){
            console.log(col);
        });
        //console.log(devices.find(id));
        res.send('OK');
    };
    return def;
})();
(function register(api){
    api.get('/test',testmodule);
    api.get('/testajax',testajax);
    api.get('/list/:type',bkutil.GETLIST_ROUTE);
    api.get('/googleapi/:type',googleapis.mapping);

    api.post('/list/:type',bkutil.POSTLIST_ROUTE);
    api.post('/event/register',BKNotiMobileService.regDevice);
})(router);
module.exports=router;