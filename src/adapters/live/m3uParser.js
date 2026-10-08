function parseAttributes(line){
  const attrs={};
  const match=line.match(/^#EXTINF:[^,]*,?(.*)$/i);
  const title=match?.[1]?.trim()||'';
  const metadata = line.slice(0, line.indexOf(',') >= 0 ? line.indexOf(',') : line.length);
  const regex = /[\w-]+="([^"]*)"/g;
  let m;
  while((m=regex.exec(metadata))) attrs[m[0].slice(0, m[0].indexOf('='))]=m[1];
  return {attrs,title};
}

function createChannel(pending, url, index){
  return {
    sourceItemId:pending['tvg-id']||pending.title||`item-${index+1}`,
    canonicalId:pending['tvg-id']||'',
    channelKey:pending['tvg-id']||pending.title||'',
    name:pending.title||pending['tvg-name']||`频道 ${index+1}`,
    logo:pending['tvg-logo']||'',
    category:pending['group-title']||'未分类',
    sourceOrder:index,
    stream:{
      url,
      label:pending['tvg-name']||'主线路',
      quality:pending['tvg-quality']||'',
      resolution:pending['tvg-resolution']||''
    }
  };
}

function getLines(text){
  return String(text??'').replace(/^\uFEFF/,'').split(/\r?\n/).map(x=>x.trim());
}

export function parseM3U(text){
  const lines=getLines(text);
  const channels=[];
  let pending=null;
  for(const line of lines){
    if(!line) continue;
    if(/^#EXTINF/i.test(line)){
      const {attrs,title}=parseAttributes(line);
      pending={...attrs,title:title||attrs['tvg-name']||''};
      continue;
    }
    if(line.startsWith('#')) continue;
    if(pending){
      channels.push(createChannel(pending,line,channels.length));
      pending=null;
    }
  }
  return channels;
}

export async function parseM3UAsync(text){
  const lines=getLines(text);
  const channels=[];
  let pending=null;
  for(let i=0;i<lines.length;i++){
    const line=lines[i];
    if(!line) continue;
    if(/^#EXTINF/i.test(line)){
      const {attrs,title}=parseAttributes(line);
      pending={...attrs,title:title||attrs['tvg-name']||''};
      continue;
    }
    if(line.startsWith('#')) continue;
    if(pending){
      channels.push(createChannel(pending,line,channels.length));
      pending=null;
    }
    if(i>0&&i%1500===0) await new Promise(resolve=>setTimeout(resolve,0));
  }
  return channels;
}
