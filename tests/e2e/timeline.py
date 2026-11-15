import json,sys
d=json.load(open(sys.argv[1]))
ss=d['sessions'] if isinstance(d['sessions'],list) else d['sessions']['sessions']
s=max(ss,key=lambda x:x['start'])
ev=s['events']
def t(e):
    for k in('epochTime','receivedAt','serverTs'):
        if e.get(k):return e[k]
t0=None
print('session',s['start'],'events',len(ev))
for e in ev:
    x=t(e)
    if x and t0 is None:t0=x
    extra={k:v for k,v in e.items() if k in('boundary','who','on','chunkSeq','last','chars','turn','description','durationUntilInterruptMs')}
    if e['event'] in('turn','speaker','tokens_played','interrupt','twilio_error','ws_close','boundary','partial_prompt'):
        print(round((x-t0)/1000,3) if x else None, e['event'], extra)
