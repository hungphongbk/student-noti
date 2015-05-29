import sys,os
from os import path
import argparse,json
from datetime import datetime,timedelta
parser=None

from apiclient.discovery import build
from oauth2client.file import Storage
from oauth2client.client import flow_from_clientsecrets,OAuth2Credentials
from oauth2client.tools import run

import gflags
import httplib2

service=None
adapter=None
CLIENT_SECRETS=path.normpath(path.dirname(path.abspath(__file__))+'/clientSecret.json')
cs1_start=['6:30','7:15','8:10','9:05','10:00','10:45','12:30','13:15','14:10','15:05','16:00','16:45','17:30',
           '18:15','19:00','19:55','20:40']
cs1_end=['7:15','8:00','8:55','9:50','10:45','11:30','13:15','14:00','14:55','15:50','16:45','17:30','18:15',
         '19:00','19:45','20:40','21:25']

def defineArgs():
    global parser
    parser=argparse.ArgumentParser(description='Dong bo thoi khoa bieu cua sinh vien voi Google Calendar')
    parser.add_argument('--id',help='Ma so sinh vien cua ban')
    parser.add_argument('--mail',help='Email ma ban muon dung de dong bo thoi khoa bieu voi GG Calendar')

def buildService():
    FLAGS = gflags.FLAGS
    datfile=open(path.normpath(path.dirname(path.abspath(__file__))+'/calendar.dat'))
    st = json.load(datfile)
    print st
    credentials = OAuth2Credentials(access_token=st['access_token'],
        client_id=st['clientId'],
        client_secret=st['clientSecret'],
        token_expiry=st['expiry_date'],
        refresh_token=None,
        token_uri='https://accounts.google.com/o/oauth2/token',
        user_agent=None)

    http = httplib2.Http()
    http = credentials.authorize(http)

    global service
    service = build(serviceName='calendar', version='v3', http=http,
        developerKey='AIzaSyCrI9ElE18DxYrVUJl5PDHioYBTNuIDmwI')

def getEvents(id):
    eventlist = service.events().list(calendarId=id).execute()
    # print eventlist
        
def buildDbAdapter():
    import sqlite3
    dbpath=path.normpath(path.dirname(path.abspath(__file__))+'/../data/db.sqlite3')
    print dbpath
    conn=sqlite3.connect(dbpath)
    global adapter
    adapter=conn.cursor()

def get_period_time(schedule_info):
    # schedule_info{WeekDay,Period,Room}
    (startP,endP)=[int(i) for i in schedule_info['Period'].split('-')]
    return {
        'startTime':cs1_start[startP-1],
        'endTime':cs1_end[endP-1]
        }

def isotime(d,t,day):
    D=datetime.strptime('%s %s'%(d,t),'%m/%d/%Y %H:%M')
    D+=timedelta(days=(6 if day==0 else day-2))
    return D

def readGoogleCalendarEvents(mail):
    token=None
    results=[]
    while True:
        events=service.events().list(calendarId=mail,pageToken=token).execute()
        results+=[(i['id'],i['summary']) for i in events['items']]
        token=events.get('nextPageToken')
        if not token:
            break
    print 'OK'
    
def syncStudentCourses(id,mail):
    # Lay thoi diem bat dau hoc ki
    sql='SELECT [VALUES] FROM [SETTINGS] WHERE KEYS=\'CURRENT_SEMESTER_START\''
    adapter.execute(sql)
    startDate=adapter.fetchone()[0]
    sql='SELECT COURSES.SUBJECTID,SUBJECTS.NAME,GROUPID,SCHEDULEINFO FROM COURSES INNER JOIN SUBJECTS ON SUBJECTS.SUBJECTID=COURSES.SUBJECTID WHERE STUDENTID=%s'%id
    print sql
    rows=adapter.execute(sql)
    for r in rows:
        subject_id=r[0]
        subject_name=r[1]
        group_id=r[2]
        weeks=json.loads(r[3])
        for w in weeks:
            # w{WeekDay,Period,Room->CS1/2,Weeks}
            try:
                tm=get_period_time(w)
            except:
                print 'null'
                continue
            start=isotime(d=startDate,t=tm['startTime'],day=int(w['WeekDay']))
            end=isotime(d=startDate,t=tm['endTime'],day=int(w['WeekDay']))
            event={
                'summary':subject_name,
                'location':w['Room'],
                'start':{
                    'dateTime':''
                },
                'end':{
                    'dateTime':''
                }
            }
            for i,c in enumerate(w['Weeks']):
                if (c!='-'):
                    event['start']['dateTime']=start.isoformat()+'+07:00'
                    event['end']['dateTime']=end.isoformat()+'+07:00'
                    created_event=service.events().insert(calendarId=mail, body=event).execute()
                    print '%s'%created_event['id']+'\n'
                start+=timedelta(days=7)
                end+=timedelta(days=7)

def main(argv):
    defineArgs()
    args=parser.parse_args()
    buildService()
    getEvents(id=args.mail)
    buildDbAdapter()
    syncStudentCourses(id=args.id,mail=args.mail)
    # readGoogleCalendarEvents(mail=args.mail)

if __name__=="__main__":
    main(sys.argv[1:])
