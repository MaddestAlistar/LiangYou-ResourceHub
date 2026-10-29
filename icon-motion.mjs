/* Detect a JPEG with a real embedded MP4/MOV trailer (Motion Photo format).
 * Plain Apple Live Photo JPEGs normally have a separate MOV and are rejected.
 * Do not treat XMP claims or a filename containing "livephoto" as video.
 * ffprobe must independently verify the extracted video before conversion.
 */
export const MOTION_LIMIT_BYTES = 10 * 1024 * 1024;
const ascii = (bytes, pos, len) => String.fromCharCode(...bytes.subarray(pos,pos+len));
const atomSize = (bytes, pos) => (bytes[pos]*0x1000000)+(bytes[pos+1]<<16)+(bytes[pos+2]<<8)+bytes[pos+3];
function containsAtom(bytes,start,end,name) {
  const max=Math.min(end-4,bytes.length-4);
  for(let i=start;i<=max;i++)if(bytes[i]===name.charCodeAt(0)&&
    bytes[i+1]===name.charCodeAt(1)&&bytes[i+2]===name.charCodeAt(2)&&bytes[i+3]===name.charCodeAt(3))return true;
  return false;
}
export function inspectEmbeddedMotion(bytes) {
  if(!(bytes instanceof Uint8Array)||bytes.length<64||bytes.length>MOTION_LIMIT_BYTES||
     bytes[0]!==0xff||bytes[1]!==0xd8)return null;
  // MP4 'ftyp' begins four bytes after the video start (32-bit atom length).
  // Track JPEG EOI preceding it, not arbitrary XMP 'MotionPhoto' metadata.
  let lastEoi=-1;
  for(let i=2;i+16<bytes.length;i++){
    if(bytes[i]===0xff&&bytes[i+1]===0xd9){lastEoi=i+2;i++;continue;}
    if(bytes[i]!==0x66||bytes[i+1]!==0x74||bytes[i+2]!==0x79||bytes[i+3]!==0x70)continue;
    const videoOffset=i-4;
    if(lastEoi<0||lastEoi>videoOffset||videoOffset-lastEoi>131072||videoOffset<32)continue;
    const length=atomSize(bytes,videoOffset);
    if(length<16||length>4096||videoOffset+length>bytes.length)continue;
    const brand=ascii(bytes,i+4,4);
    if(!/^(isom|iso2|iso5|iso6|mp41|mp42|avc1|qt  |M4V |MSNV|3gp[4567])$/.test(brand))continue;
    const tail=bytes.length-videoOffset;
    if(tail<64||(!containsAtom(bytes,videoOffset+8,bytes.length,'mdat')&&
                  !containsAtom(bytes,videoOffset+8,bytes.length,'moov')))continue;
    return {videoOffset,videoBytes:tail,brand,container:brand==='qt  '?'mov':'mp4'};
  }
  return null;
}
