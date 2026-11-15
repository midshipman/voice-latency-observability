import asyncio, edge_tts, subprocess, wave
ITEMS={'short':"What is the weather like today?",
 'second':"Can you tell me one fun fact about the moon?"}
async def main():
    for k,t in ITEMS.items(): await edge_tts.Communicate(t,"en-US-JennyNeural").save(k+'.mp3')
asyncio.run(main())
for k in ITEMS: subprocess.run(['ffmpeg','-loglevel','error','-y','-i',k+'.mp3','-ar','48000','-ac','1','-c:a','pcm_s16le',k+'.wav'],check=True)
def sil(s): return b'\x00\x00'*int(48000*s)
def rd(n): w=wave.open(n+'.wav'); return w.readframes(w.getnframes())
def build(out,parts):
    b=b''.join(sil(p) if isinstance(p,(int,float)) else rd(p) for p in parts)
    w=wave.open(out,'wb'); w.setnchannels(1); w.setsampwidth(2); w.setframerate(48000); w.writeframes(b); w.close()
build('en1.wav',[9,'short',14,'second',14])
