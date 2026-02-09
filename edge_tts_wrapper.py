import sys
import edge_tts
import asyncio

async def main():
    text = sys.argv[1]
    voice = sys.argv[2]
    rate = sys.argv[3]
    pitch = sys.argv[4]
    output = sys.argv[5]
    
    communicate = edge_tts.Communicate(text, voice, rate=rate, pitch=pitch)
    await communicate.save(output)

if __name__ == "__main__":
    asyncio.run(main())