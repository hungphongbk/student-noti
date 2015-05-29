function success(res,obj){
    res.send(obj);
}
function failed(res,err){
    res.status(501).send(err);
}
function minifyJSON(json,keys,reverse){
    var rs={};
    reverse=reverse||false;
    if (!reverse)
        keys.forEach(function(e){
            rs[e]=json[e];
        });
    else{
        var keys2=Object.keys(json);
        keys2.forEach(function(e){
            if (keys.indexOf(e)<0) rs[e]=json[e];
        });
    }
    return rs;
}
function groupBy(arr,keys){
    var group={};
    arr.forEach(function(o){
        var g=JSON.stringify(minifyJSON(o,keys));
        group[g]=group[g]||[];
        group[g].push(minifyJSON(o,keys,true));
    });
    return Object.keys(group).map(function(g){
        return {
            key:JSON.parse(g),
            values:group[g]
        };
    });
}
function semesterDetails(semCode){
    this.SemesterCode=semCode;
    this.Items=[];
    this.Summary={};
}
semesterDetails.prototype.parseTable=function(html){

};

var deferred=require('deferred');
var sqlite3=require('sqlite3').verbose();
var path=require('path');

/**
 * Proxy co nhiem vu gui nhan du lieu giua AAO server va CSDL trung gian
 */
var proxy=(function(){
    var main_uri='http://www.aao.hcmut.edu.vn/image/data/Tra_cuu/';
    var jsdom=require('jsdom');
    var request=require('request');
    var vnese=/([\s\wÀÁÂÃÈÉÊÌÍÒÓÔÕÙÚĂĐĨŨƠàáâãèéêìíòóôõùúăđĩũơƯĂẠẢẤẦẨẪẬẮẰẲẴẶẸẺẼỀỀỂ ưăạảấầẩẫậắằẳẵặẹẻẽềềểỄỆỈỊỌỎỐỒỔỖỘỚỜỞỠỢỤỦỨỪễệỉịọỏốồổỗộớờởỡợụủứừỬỮỰỲỴÝỶỸửữựỳỵỷỹ]+)/;

    /**
     * Gui/nhan du lieu truc tiep voi aao.hcmut.edu.vn
     * @param rellink xem_tkb/xem_lt/xem_bd
     * @param data POST DATA (neu co)
     * @returns {*}
     */
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

    /**
     * Trich xuat danh sach cac hoc ki co trong trang tra cuu
     * @param $ jQuery DOM
     * @returns {*}
     */
    function downloadSemesterList($){
        var dfd=new deferred();
        var results=$('select[name="HOC_KY"]>option').get().map(function(e){
            return $(e).val();
        });
        dfd.resolve(results);
        return dfd.promise();
    }

    /**
     * Download ten (va mot so thong tin khac neu co) cua SV co MSSV {stu}
     * @param stu MSSV
     * @returns {*}
     */
    function downloadStuName(stu) {
        console.log('PROXY: download student info with student ID = ',stu);
        return search('xem_tkb', {
            'HOC_KY': '20142',
            'mssv': stu
        }).then(function ($) {
            var css = $('font[color="#3300CC"]');
            if (css.length == 0)
                return {
                    Status: "failed",
                    StudentID: stu,
                    StudentName: "Không tìm thấy sinh viên này"
                };
            var txt = css.text();
            txt = txt.match(vnese);
            return {
                Status: "succeeded",
                StudentName: txt[0],
                StudentID: stu
            };
        });
    }


    return {
        download: {
            stuName: downloadStuName
        }
    };
})();

/**
 * CSDL trung gian
 */
var bknotidb=(function(client){

    var task=new deferred();
    function BKNOTIDB(){
        this.db=new sqlite3.Database(path.resolve(__dirname,client),function(err){
            if(err!=null){
                console.log(err);
                task.reject();
            } else {
                console.log("We are connected");
                task.resolve();
            }
        });
        this.waiter=task.promise();
    }

    function mapSTUDENTS(row,others){
        var obj={
            StudentID:row['STUDENTID'],
            StudentName:row['NAME']
        };
        for(var i in others) obj[i]=others[i];
        return obj;
    }

    /**
     * Luu ten sinh vien vao CSDL (bang STUDENTS)
     * @param obj
     * @returns {*}
     */
    BKNOTIDB.prototype.setStudentName=function(obj){
        console.log('BKNOTIDB: write new student info with student ID = ',obj.StudentID);
        var task2=new deferred();
        this.db.run('INSERT INTO STUDENTS(STUDENTID,NAME) VALUES (?,?)',
            [obj.StudentID,obj.StudentName],function(err){
                if(err!=null){
                    console.log('BKNOTIDB - ERROR: ', err);
                    task2.reject();
                } else {
                    task2.resolve();
                }
            });
        return task2.promise();
    };

    /**
     * Lay ten sinh vien tu CSDL
     * @param stuId
     * @returns {*}
     */
    BKNOTIDB.prototype.getStudentName=function(stuId){
        var _this=this;
        var dfd=new deferred();
        var sql='';

        /**
         * Kiem tra xem sinh vien co ma so sinh vien stuId co ton tai trong aao khong
         * Neu co, va sv nay chua nam trong CSDL trung gian, ghi vao
         * @returns {*}
         */
        function checkExist() {
            sql='SELECT STUDENTID FROM STUDENTS WHERE STUDENTID=\''+stuId+'\'';
            var check=new deferred();
            _this.db.get(sql, function (err, row) {
                if (err != null || (typeof row === 'undefined')) {
                    proxy.download.stuName(stuId).then(function(stu) {
                        if (stu.Status == 'failed') check.reject(stu);
                        else _this.setStudentName(stu).then(function () {
                            check.resolve();
                        })
                    });
                }
                else check.resolve();
            });
            return check.promise();
        }

        /**
         * Lay thong tin tu CSDL trung gian
         * @returns {*}
         */
        function getResult() {
            sql = 'SELECT * FROM STUDENTS WHERE STUDENTID=\'' + stuId + '\'';
            var dfd=new deferred();
            _this.db.get(sql, function (err, row) {
                dfd.resolve(mapSTUDENTS(row,{Status:'succeeded'}));
            });
            return dfd.promise();
        }
        return checkExist().then(getResult,function(stu_none){
            console.log(stu_none);
            return stu_none;
        });
    };



    /**
     * Lay thoi khoa bieu tu CSDL
     * @param stuID
     * @returns {*}
     */
    BKNOTIDB.prototype.getTKB=function(stuID){
        var dfd=new deferred();
        var that=this;
        var obj={'StudentID':stuID};
        //get newest semester
        this.db.serialize(function(){
            var sem='';
            that.db.get('SELECT MAX(SEMESTERID) AS VALUE FROM COURSES WHERE STUDENTID=?',[stuID],function(e,r){
                sem=r.VALUE;
                if(sem=='') dfd.reject();

                obj['SemesterCode']=sem;
                obj['Items']=[];

                var sql="SELECT COURSES.SUBJECTID,SUBJECTS.NAME,COURSES.GROUPID,COURSES.SCHEDULEINFO FROM COURSES ";
                sql+="INNER JOIN SUBJECTS ON COURSES.SUBJECTID=SUBJECTS.SUBJECTID ";
                sql+="WHERE STUDENTID=? AND SEMESTERID=?";

                that.db.each(sql,[stuID,sem],function(err,r){
                    obj.Items.push({
                        'key':{
                            'ID': r.SUBJECTID,
                            'Name': r.NAME,
                            'Group': r.GROUPID
                        },
                        'values':JSON.parse(r.SCHEDULEINFO)
                    });
                },function(err){
                    if(obj.Items.length==0) dfd.reject();
                    dfd.resolve(obj);
                });
            });
        });
        return dfd.promise();
    };

    /**
     * Cap nhat mon hoc moi vao danh sach mon hoc CSDL
     * @param subId
     * @param subName
     * @returns {*}
     */
    BKNOTIDB.prototype.setSubject=function(subId,subName){
        var dfd=new deferred();
        var that=this;
        this.db.get('SELECT * FROM SUBJECTS WHERE SUBJECTID=?',[subId],function(err,row){
            if(err){
                console.log(err);
                dfd.reject();
            } else {
                if(row)
                    dfd.resolve();
                else{
                    that.db.run('INSERT INTO SUBJECTS VALUES (?,?,?)',[subId,subName,''],function(err){
                        if(err){
                            console.log(err);
                            dfd.reject();
                        } else dfd.resolve();
                    });
                }
            }
        });
        return dfd.promise();
    };

    /**
     * Cap nhat thoi khoa bieu cua sinh vien vao CSDL
     * @param obj
     * @returns {*}
     */
    BKNOTIDB.prototype.setTKB=function(obj){
        var dfd=new deferred();
        var that=this;
        //console.log(obj);
        obj.Items.forEach(function(e){
            //process e.Key
            that.setSubject(e.key.ID, e.key.Name).then(function(){
                var data=[obj.StudentID, e.key.ID,obj.SemesterCode, e.key.Group, JSON.stringify(e.values)];
                that.db.run('INSERT INTO COURSES VALUES (?,?,?,?,?)', data, function(err){
                    if(err)
                        console.log(err);
                });
            });
        });
        dfd.resolve(obj);
        return dfd.promise();
    };

    /**
     * Lay thoi khoa bieu tu CSDL, phan nhom theo tuan
     * @param obj
     * @returns {*}
     */
    BKNOTIDB.prototype.getTKB_ByWeek=function(obj){
        var dfd=new deferred();
        //Lay so tuan hien tai
        var current=new Date();
        this.db.get('SELECT [VALUES] FROM SETTINGS WHERE KEYS=?',['CURRENT_SEMESTER_START'],function(e,r){
            if(e){
                dfd.reject(e);
            }
            var obj2={
                StudentID:obj.StudentID,
                SemesterCode:obj.SemesterCode,
                Items:[]
            };
            var begin=new Date(r.VALUES);
            var weekUnit=604800000;
            var currentWeek=Math.ceil((current-begin)/weekUnit);
            obj2['CurrentWeek']=currentWeek;
            var currentWeekDay=current.getDay()+1;
            if (currentWeekDay==1) currentWeekDay=8;

            obj.Items.forEach(function(c){
                var c2={};

                c.values.forEach(function(v){
                    if ((v.WeekDay==currentWeekDay)&&(v.Weeks[currentWeek-1]>='0' && v.Weeks[currentWeek-1]<='9')){
                        c2['ID']= c.key.ID;
                        c2['Name']= c.key.Name;
                        c2['Group']= c.key.Group;
                        c2['WeekDay']= currentWeekDay;
                        c2['Period']= v.Period;
                        c2['Room']= v.Room;

                        return false;
                    }
                });
                if(Object.keys(c2).length>0)
                    obj2.Items.push(c2);
            });
            dfd.resolve(obj2);
        });
        return dfd.promise();
    };

    return BKNOTIDB;
})('../public/data/db.sqlite3');
module.exports={
    success:success,
    failed:failed,
    SemesterDetails:semesterDetails,
    groupBy:groupBy,
    BKNOTIDB:bknotidb
};