function j(r,i,t){if(!i.length)return r.slice(0,t).map((d,s)=>({...d,rank:s+1}));let f=new Set(i.map(d=>d.tmdb_id).filter(Boolean)),e=r.filter(d=>!f.has(d.tmdb_id)),o={};for(let d of i){let s=Math.max(1,parseInt(d.rank)||1);o[s]||(o[s]=[]),o[s].push(d)}let n=[],_=0,c=1;for(;n.length<t;){if(o[c]&&o[c].length){let d=o[c].shift();n.push({...d,rank:n.length+1})}else if(_<e.length)n.push({...e[_],rank:n.length+1}),_++;else{let d=Object.values(o).flat();for(let s of d){if(n.length>=t)break;n.push({...s,rank:n.length+1})}break}c++}return n}async function X(r,i){if(!i||!i.length)return[];let t=i.map(e=>r.DB.prepare(`
      SELECT platform, category_slot, rank, title_ko, title_en, tmdb_id,
             poster_path, genre, tmdb_rating, release_year, memo, date
      FROM rankings
      WHERE platform = ? AND category_slot = ?
        AND date = (
          SELECT MAX(date) FROM rankings
          WHERE platform = ? AND category_slot = ? AND date != 'manual'
        )
      ORDER BY rank ASC
    `).bind(e.platform,e.category_slot,e.platform,e.category_slot));return(await r.DB.batch(t)).flatMap(e=>e.results||[])}async function Q(r,i,t,f,e){if(r==="/rankings"&&i.method==="GET"){let o=f.searchParams.get("platform"),n=f.searchParams.get("category"),_=f.searchParams.get("date"),c="SELECT * FROM rankings WHERE 1=1",d=[];o&&(c+=" AND platform = ?",d.push(o)),n&&(c+=" AND category = ?",d.push(n)),_?(c+=" AND date = ?",d.push(_)):c+=" AND date = (SELECT value FROM app_settings WHERE key = 'latest_ranking_date')",c+=" ORDER BY platform, category, rank";let{results:s}=await t.DB.prepare(c).bind(...d).all();return new Response(JSON.stringify({ok:!0,data:s}),{headers:e})}if(r==="/rankings/main"&&i.method==="GET")try{let o=f.searchParams.get("date")||null,{results:n}=await t.DB.prepare(`
        SELECT platform, category_slot, display_name, main_section, main_order, main_limit, memo_label
        FROM ott_categories
        WHERE main_section IS NOT NULL AND is_active = 1
      `).all(),_={};for(let y of n)_[`${y.platform}__${y.category_slot}`]=y;let{results:c}=await t.DB.prepare(`
        SELECT
          r.platform, r.category_slot, r.rank, r.title_ko, r.title_en,
          r.tmdb_id, r.poster_path, r.genre, r.tmdb_rating, r.release_year, r.memo
        FROM rankings r
        JOIN ott_categories oc
          ON r.platform = oc.platform AND r.category_slot = oc.category_slot
        WHERE oc.main_section IS NOT NULL
          AND oc.is_active = 1
          AND r.date = COALESCE(?, (SELECT value FROM app_settings WHERE key = 'latest_ranking_date'))
          AND r.rank <= oc.main_limit + 20
        ORDER BY oc.main_section, oc.main_order, r.rank
      `).bind(o).all(),{results:d}=await t.DB.prepare(`
        SELECT
          r.platform, r.category_slot, r.rank, r.title_ko, r.title_en,
          r.tmdb_id, r.poster_path, r.genre, r.tmdb_rating, r.release_year, r.memo
        FROM rankings r
        JOIN ott_categories oc
          ON r.platform = oc.platform AND r.category_slot = oc.category_slot
        WHERE oc.main_section IS NOT NULL
          AND oc.is_active = 1
          AND r.is_manual = 1
          AND r.date = 'manual'
        ORDER BY oc.main_section, oc.main_order, r.rank
      `).all(),s={},a={};for(let y of c){let k=`${y.platform}__${y.category_slot}`;s[k]||(s[k]=[]),s[k].push(y)}for(let y of d){let k=`${y.platform}__${y.category_slot}`;a[k]||(a[k]=[]),a[k].push(y)}if(!o){let y=n.filter(k=>!s[`${k.platform}__${k.category_slot}`]);if(y.length){let k=await X(t,y);for(let S of k){let R=`${S.platform}__${S.category_slot}`;s[R]||(s[R]=[]),s[R].push(S)}}}let l={},p={},u={},g=new Set([...Object.keys(s),...Object.keys(a)]);for(let y of g){let k=_[y];if(!k)continue;let S=k.main_limit||10,R=j((s[y]||[]).sort((b,T)=>b.rank-T.rank),(a[y]||[]).sort((b,T)=>b.rank-T.rank),S);for(let b of R){let T={rank:b.rank,title_ko:b.title_ko,title_en:b.title_en,tmdb_id:b.tmdb_id,poster_path:b.poster_path,genre:b.genre,tmdb_rating:b.tmdb_rating,release_year:b.release_year,memo:b.memo||null,display_name:k.display_name,platform:k.platform,category_slot:k.category_slot,main_order:k.main_order};k.main_section==="tv"?(l[y]||(l[y]={platform:k.platform,category_slot:k.category_slot,display_name:k.display_name,main_order:k.main_order,memo_label:k.memo_label||null,items:[]}),l[y].items.push(T)):k.main_section==="movie"?(p[y]||(p[y]={platform:k.platform,category_slot:k.category_slot,display_name:k.display_name,main_order:k.main_order,memo_label:k.memo_label||null,items:[]}),p[y].items.push(T)):k.main_section==="featured"&&k.platform==="netflix"&&(u[y]||(u[y]={platform:k.platform,category_slot:k.category_slot,display_name:k.display_name,main_order:k.main_order,memo_label:k.memo_label||null,items:[]}),u[y].items.push(T))}}let m=Object.values(l).sort((y,k)=>y.main_order-k.main_order),E=Object.values(p).sort((y,k)=>y.main_order-k.main_order),w=Object.values(u).sort((y,k)=>y.main_order-k.main_order).slice(0,2);return new Response(JSON.stringify({ok:!0,tv:m,movie:E,featured:w}),{headers:e})}catch(o){return new Response(JSON.stringify({ok:!1,message:o.message}),{status:500,headers:e})}if(r==="/rankings/platform"&&i.method==="GET")try{let o=f.searchParams.get("platform"),n=f.searchParams.get("date")||null;if(!o)return new Response(JSON.stringify({ok:!1,message:"platform required"}),{status:400,headers:e});let{results:_}=await t.DB.prepare(`
        SELECT platform, category_slot, display_name, platform_section, platform_order, platform_limit, memo_label
        FROM ott_categories
        WHERE platform = ? AND platform_section IS NOT NULL AND is_active = 1
      `).bind(o).all(),c={};for(let m of _)c[m.category_slot]=m;let{results:d}=await t.DB.prepare(`
        SELECT
          r.platform, r.category_slot, r.rank, r.title_ko, r.title_en,
          r.tmdb_id, r.poster_path, r.genre, r.tmdb_rating, r.release_year, r.memo
        FROM rankings r
        JOIN ott_categories oc
          ON r.platform = oc.platform AND r.category_slot = oc.category_slot
        WHERE r.platform = ?
          AND oc.platform_section IS NOT NULL
          AND oc.is_active = 1
          AND r.date = COALESCE(?, (SELECT value FROM app_settings WHERE key = 'latest_ranking_date'))
          AND r.rank <= oc.platform_limit + 20
        ORDER BY oc.platform_order, r.rank
      `).bind(o,n).all(),{results:s}=await t.DB.prepare(`
        SELECT
          r.platform, r.category_slot, r.rank, r.title_ko, r.title_en,
          r.tmdb_id, r.poster_path, r.genre, r.tmdb_rating, r.release_year, r.memo
        FROM rankings r
        JOIN ott_categories oc
          ON r.platform = oc.platform AND r.category_slot = oc.category_slot
        WHERE r.platform = ?
          AND oc.platform_section IS NOT NULL
          AND oc.is_active = 1
          AND r.is_manual = 1
          AND r.date = 'manual'
        ORDER BY oc.platform_order, r.rank
      `).bind(o).all(),a={},l={};for(let m of d){let E=m.category_slot;a[E]||(a[E]=[]),a[E].push(m)}for(let m of s){let E=m.category_slot;l[E]||(l[E]=[]),l[E].push(m)}if(!n){let m=_.filter(E=>!a[E.category_slot]);if(m.length){let E=await X(t,m);for(let w of E){let y=w.category_slot;a[y]||(a[y]=[]),a[y].push(w)}}}let p={},u=new Set([...Object.keys(a),...Object.keys(l)]);for(let m of u){let E=c[m];if(!E)continue;let w=E.platform_limit||20,y=j((a[m]||[]).sort((k,S)=>k.rank-S.rank),(l[m]||[]).sort((k,S)=>k.rank-S.rank),w);p[m]={platform:E.platform,category_slot:E.category_slot,display_name:E.display_name,platform_order:E.platform_order,memo_label:E.memo_label||null,items:y.map(k=>({rank:k.rank,title_ko:k.title_ko,title_en:k.title_en,tmdb_id:k.tmdb_id,poster_path:k.poster_path,genre:k.genre,tmdb_rating:k.tmdb_rating,release_year:k.release_year,memo:k.memo||null}))}}let g=Object.values(p).sort((m,E)=>m.platform_order-E.platform_order);return new Response(JSON.stringify({ok:!0,data:g}),{headers:e})}catch(o){return new Response(JSON.stringify({ok:!1,message:o.message}),{status:500,headers:e})}if(r==="/rankings/weekly"&&i.method==="GET")try{let{results:o}=await t.DB.prepare(`
        SELECT
          r.platform, r.category_slot, r.title_ko, r.title_en,
          r.tmdb_id, r.poster_path, r.genre, r.release_year,
          MAX(r.tmdb_rating) AS tmdb_rating,
          COUNT(*) AS days_in_chart,
          SUM(11 - r.rank) AS score,
          ROW_NUMBER() OVER (
            PARTITION BY r.platform, r.category_slot ORDER BY SUM(11 - r.rank) DESC
          ) AS rank,
          oc.display_name, oc.main_section, oc.main_order, oc.main_limit, oc.memo_label
        FROM rankings r
        JOIN ott_categories oc ON r.platform = oc.platform AND r.category_slot = oc.category_slot
        WHERE oc.main_section IS NOT NULL
          AND oc.is_active = 1
          AND r.date >= date((SELECT value FROM app_settings WHERE key = 'latest_ranking_date'), '-6 days')
          AND r.date < 'manual'
          AND r.rank <= 10
        GROUP BY r.platform, r.category_slot, r.title_ko
        ORDER BY oc.main_section, oc.main_order, rank
      `).all(),n={},_={};for(let s of o){if(s.rank>(s.main_limit||10))continue;let a=`${s.platform}__${s.category_slot}`,l={rank:s.rank,title_ko:s.title_ko,title_en:s.title_en,tmdb_id:s.tmdb_id,poster_path:s.poster_path,genre:s.genre,tmdb_rating:s.tmdb_rating,release_year:s.release_year,platform:s.platform,category_slot:s.category_slot,display_name:s.display_name,main_order:s.main_order};s.main_section==="tv"?(n[a]||(n[a]={platform:s.platform,category_slot:s.category_slot,display_name:s.display_name,main_order:s.main_order,items:[]}),n[a].items.push(l)):s.main_section==="movie"&&(_[a]||(_[a]={platform:s.platform,category_slot:s.category_slot,display_name:s.display_name,main_order:s.main_order,items:[]}),_[a].items.push(l))}let c=Object.values(n).sort((s,a)=>s.main_order-a.main_order),d=Object.values(_).sort((s,a)=>s.main_order-a.main_order);return new Response(JSON.stringify({ok:!0,tv:c,movie:d}),{headers:e})}catch(o){return new Response(JSON.stringify({ok:!1,message:o.message}),{status:500,headers:e})}if(r==="/rankings/monthly"&&i.method==="GET")try{let{results:o}=await t.DB.prepare(`
        SELECT
          r.platform, r.category_slot, r.title_ko, r.title_en,
          r.tmdb_id, r.poster_path, r.genre, r.release_year,
          MAX(r.tmdb_rating) AS tmdb_rating,
          COUNT(*) AS days_in_chart,
          SUM(11 - r.rank) AS score,
          ROW_NUMBER() OVER (
            PARTITION BY r.platform, r.category_slot ORDER BY SUM(11 - r.rank) DESC
          ) AS rank,
          oc.display_name, oc.main_section, oc.main_order, oc.main_limit, oc.memo_label
        FROM rankings r
        JOIN ott_categories oc ON r.platform = oc.platform AND r.category_slot = oc.category_slot
        WHERE oc.main_section IS NOT NULL
          AND oc.is_active = 1
          AND r.date >= date((SELECT value FROM app_settings WHERE key = 'latest_ranking_date'), '-29 days')
          AND r.date < 'manual'
          AND r.rank <= 10
        GROUP BY r.platform, r.category_slot, r.title_ko
        ORDER BY oc.main_section, oc.main_order, rank
      `).all(),n={},_={};for(let s of o){if(s.rank>(s.main_limit||10))continue;let a=`${s.platform}__${s.category_slot}`,l={rank:s.rank,title_ko:s.title_ko,title_en:s.title_en,tmdb_id:s.tmdb_id,poster_path:s.poster_path,genre:s.genre,tmdb_rating:s.tmdb_rating,release_year:s.release_year,platform:s.platform,category_slot:s.category_slot,display_name:s.display_name,main_order:s.main_order};s.main_section==="tv"?(n[a]||(n[a]={platform:s.platform,category_slot:s.category_slot,display_name:s.display_name,main_order:s.main_order,items:[]}),n[a].items.push(l)):s.main_section==="movie"&&(_[a]||(_[a]={platform:s.platform,category_slot:s.category_slot,display_name:s.display_name,main_order:s.main_order,items:[]}),_[a].items.push(l))}let c=Object.values(n).sort((s,a)=>s.main_order-a.main_order),d=Object.values(_).sort((s,a)=>s.main_order-a.main_order);return new Response(JSON.stringify({ok:!0,tv:c,movie:d}),{headers:e})}catch(o){return new Response(JSON.stringify({ok:!1,message:o.message}),{status:500,headers:e})}if(r==="/rankings/history"&&i.method==="GET"){let o=parseInt(f.searchParams.get("tmdb_id"));if(!o)return new Response(JSON.stringify({ok:!1,message:"tmdb_id required"}),{status:400,headers:e});let{results:n}=await t.DB.prepare(`
      SELECT date, platform, category_slot, rank
      FROM rankings
      WHERE tmdb_id = ?
        AND date < 'manual'
        AND date >= date((SELECT value FROM app_settings WHERE key = 'latest_ranking_date'), '-29 days')
      ORDER BY date ASC, platform ASC
    `).bind(o).all();return new Response(JSON.stringify({ok:!0,data:n}),{headers:e})}if(r.startsWith("/rankings/platforms/")&&i.method==="GET"){let o=parseInt(r.split("/rankings/platforms/")[1]);if(!o)return new Response(JSON.stringify({ok:!1,message:"tmdb_id required"}),{status:400,headers:e});try{let{results:n}=await t.DB.prepare(`
        SELECT DISTINCT platform, MIN(rank) as rank
        FROM rankings
        WHERE tmdb_id = ?
          AND date = (SELECT value FROM app_settings WHERE key = 'latest_ranking_date')
        GROUP BY platform
        ORDER BY rank ASC
      `).bind(o).all();return new Response(JSON.stringify({ok:!0,data:n}),{headers:e})}catch(n){return new Response(JSON.stringify({ok:!1,message:n.message}),{status:500,headers:e})}}if(r==="/rankings/platforms-batch"&&i.method==="GET"){let o=(f.searchParams.get("tmdb_ids")||"").trim();if(!o)return new Response(JSON.stringify({ok:!1,message:"tmdb_ids required"}),{status:400,headers:e});let n=[...new Set(o.split(",").map(_=>parseInt(_.trim())).filter(_=>Number.isInteger(_)&&_>0))].slice(0,50);if(!n.length)return new Response(JSON.stringify({ok:!1,message:"\uC720\uD6A8\uD55C tmdb_ids\uAC00 \uC5C6\uC2B5\uB2C8\uB2E4"}),{status:400,headers:e});try{let _=n.map(()=>"?").join(","),{results:c}=await t.DB.prepare(`
        SELECT tmdb_id, platform, MIN(rank) as rank
        FROM rankings
        WHERE tmdb_id IN (${_})
          AND date = (SELECT value FROM app_settings WHERE key = 'latest_ranking_date')
        GROUP BY tmdb_id, platform
        ORDER BY tmdb_id, rank ASC
      `).bind(...n).all(),d={};for(let s of c)d[s.tmdb_id]||(d[s.tmdb_id]=[]),d[s.tmdb_id].push({platform:s.platform,rank:s.rank});return new Response(JSON.stringify({ok:!0,data:d}),{headers:e})}catch(_){return new Response(JSON.stringify({ok:!1,message:_.message}),{status:500,headers:e})}}if(r==="/rankings/person-widget"&&i.method==="GET")try{let o=await t.DB.prepare(`
        SELECT platform, category_slot, display_name, person_limit
        FROM ott_categories
        WHERE person_section = 'person'
          AND is_active = 1
        ORDER BY person_order ASC
        LIMIT 1
      `).first();if(!o)return new Response(JSON.stringify({ok:!0,data:null}),{headers:e});let n=o.person_limit||10,{results:_}=await t.DB.prepare(`
        SELECT r.rank, r.title_ko, r.title_en, r.tmdb_id, r.poster_path, r.genre,
               r.tmdb_rating, r.release_year, w.media_type
        FROM rankings r
        LEFT JOIN works w ON r.tmdb_id = w.tmdb_id
        WHERE r.platform = ? AND r.category_slot = ?
          AND r.date = (SELECT value FROM app_settings WHERE key = 'latest_ranking_date')
        ORDER BY r.rank ASC
      `).bind(o.platform,o.category_slot).all();if(!_.length){let{results:s}=await t.DB.prepare(`
          SELECT r.rank, r.title_ko, r.title_en, r.tmdb_id, r.poster_path, r.genre,
                 r.tmdb_rating, r.release_year, w.media_type
          FROM rankings r
          LEFT JOIN works w ON r.tmdb_id = w.tmdb_id
          WHERE r.platform = ? AND r.category_slot = ?
            AND r.date = (
              SELECT MAX(date) FROM rankings
              WHERE platform = ? AND category_slot = ? AND date != 'manual'
            )
          ORDER BY r.rank ASC
        `).bind(o.platform,o.category_slot,o.platform,o.category_slot).all();_=s}let{results:c}=await t.DB.prepare(`
        SELECT r.rank, r.title_ko, r.title_en, r.tmdb_id, r.poster_path, r.genre,
               r.tmdb_rating, r.release_year, w.media_type
        FROM rankings r
        LEFT JOIN works w ON r.tmdb_id = w.tmdb_id
        WHERE r.platform = ? AND r.category_slot = ?
          AND r.is_manual = 1 AND r.date = 'manual'
        ORDER BY r.rank ASC
      `).bind(o.platform,o.category_slot).all(),d=j(_,c,n);return new Response(JSON.stringify({ok:!0,data:{platform:o.platform,category_slot:o.category_slot,display_name:o.display_name,items:d.map(s=>({rank:s.rank,title_ko:s.title_ko,title_en:s.title_en,tmdb_id:s.tmdb_id,poster_path:s.poster_path,genre:s.genre,tmdb_rating:s.tmdb_rating,release_year:s.release_year,media_type:s.media_type||null}))}}),{headers:e})}catch(o){return new Response(JSON.stringify({ok:!1,message:o.message}),{status:500,headers:e})}if(r.startsWith("/rankings/manual/")&&i.method==="GET"){let o=parseInt(r.split("/rankings/manual/")[1]);if(!o)return new Response(JSON.stringify({ok:!1,message:"tmdb_id required"}),{status:400,headers:e});try{let{results:n}=await t.DB.prepare(`
        SELECT
          r.rank, r.memo, r.platform, r.category_slot,
          oc.display_name, oc.memo_label
        FROM rankings r
        LEFT JOIN ott_categories oc
          ON r.platform = oc.platform AND r.category_slot = oc.category_slot
        WHERE r.tmdb_id = ? AND r.date = 'manual'
        ORDER BY r.rank ASC
      `).bind(o).all();return new Response(JSON.stringify({ok:!0,data:n}),{headers:e})}catch(n){return new Response(JSON.stringify({ok:!1,message:n.message}),{status:500,headers:e})}}if(r==="/latest-date"){let{results:o}=await t.DB.prepare("SELECT value as date FROM app_settings WHERE key = 'latest_ranking_date'").all();return new Response(JSON.stringify({ok:!0,data:o[0]}),{headers:e})}if(r==="/platforms"){let{results:o}=await t.DB.prepare("SELECT DISTINCT platform FROM rankings ORDER BY platform").all();return new Response(JSON.stringify({ok:!0,data:o}),{headers:e})}if(r==="/sitemap.xml"){try{if(t.SITEMAP_CACHE){let o=await t.SITEMAP_CACHE.get("sitemap_xml");if(o)return new Response(o,{headers:{...e,"Content-Type":"application/xml; charset=utf-8","X-Sitemap-Cache":"HIT"}})}}catch(o){console.log("sitemap cache read failed, falling back to D1:",o.message)}try{let o="https://ottrank.kr",n=new Date().getFullYear(),_=[{path:"/",changefreq:"daily",priority:"1.0"},{path:"/netflix",changefreq:"daily",priority:"0.9"},{path:"/tving",changefreq:"daily",priority:"0.9"},{path:"/disneyplus",changefreq:"daily",priority:"0.9"},{path:"/wavve",changefreq:"daily",priority:"0.9"},{path:"/coupangplay",changefreq:"daily",priority:"0.9"},{path:"/boxoffice",changefreq:"daily",priority:"0.9"},{path:"/community",changefreq:"daily",priority:"0.8"},{path:"/review",changefreq:"daily",priority:"0.8"},{path:"/reactions",changefreq:"daily",priority:"0.8"},{path:"/contents",changefreq:"daily",priority:"0.8"},{path:"/mypage",changefreq:"weekly",priority:"0.6"},{path:"/my_review",changefreq:"weekly",priority:"0.6"},{path:"/ott_intro.html",changefreq:"monthly",priority:"0.6"},{path:"/privacy",changefreq:"monthly",priority:"0.4"},{path:"/terms",changefreq:"monthly",priority:"0.4"}],{results:c}=await t.DB.prepare("SELECT tmdb_id FROM works WHERE tmdb_id IS NOT NULL ORDER BY tmdb_id").all(),{results:d}=await t.DB.prepare("SELECT tmdb_id FROM persons WHERE tmdb_id IS NOT NULL ORDER BY tmdb_id").all(),s=[];for(let l of _)s.push(`  <url>
    <loc>${o}${l.path}</loc>
    <changefreq>${l.changefreq}</changefreq>
    <priority>${l.priority}</priority>
  </url>`);for(let l of c){let p=`${o}/title/1-${n}${l.tmdb_id}`;s.push(`  <url>
    <loc>${p}</loc>
    <changefreq>weekly</changefreq>
    <priority>0.7</priority>
  </url>`)}for(let l of d){let p=`${o}/person/${l.tmdb_id}`;s.push(`  <url>
    <loc>${p}</loc>
    <changefreq>monthly</changefreq>
    <priority>0.5</priority>
  </url>`)}let a=`<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
`+s.join(`
`)+`
</urlset>`;try{t.SITEMAP_CACHE&&await t.SITEMAP_CACHE.put("sitemap_xml",a,{expirationTtl:3600})}catch(l){console.log("sitemap cache write failed (non-fatal):",l.message)}return new Response(a,{headers:{...e,"Content-Type":"application/xml; charset=utf-8","X-Sitemap-Cache":"MISS"}})}catch(o){return new Response(JSON.stringify({ok:!1,message:o.message}),{status:500,headers:e})}}return null}function N(r,i){return(r.headers.get("Authorization")||"").replace("Bearer ","")===i.ADMIN_SECRET}function L(r){let t=(r.headers.get("Cookie")||"").match(/session=([^;]+)/);return t?t[1]:null}async function W(r,i,t,f){try{return await f.DB.prepare("INSERT INTO user_point_logs (user_id, points, reason) VALUES (?, ?, ?)").bind(r,i,t).run(),await f.DB.prepare("UPDATE users SET ott_points = MAX(0, COALESCE(ott_points, 0) + ?) WHERE id = ?").bind(i,r).run(),await U(r,f),!0}catch(e){return console.error("[_addOttPoints] \uC624\uB958:",e.message),!1}}async function U(r,i){try{let t=await i.DB.prepare("SELECT grade, ott_points FROM users WHERE id = ?").bind(r).first();if(!t||(await i.DB.prepare("SELECT is_special FROM grade_settings WHERE grade_key = ?").bind(t.grade||"rookie").first())?.is_special)return;let{results:e}=await i.DB.prepare(`SELECT grade_key FROM grade_settings
       WHERE is_special = 0 AND min_ott_points <= ?
       ORDER BY min_ott_points DESC LIMIT 1`).bind(t.ott_points||0).all(),o=e[0]?.grade_key||null;o&&o!==t.grade&&await i.DB.prepare("UPDATE users SET grade = ? WHERE id = ?").bind(o,r).run()}catch(t){console.error("[GRADE]",t.message)}}async function Z(r,i){try{let S=function(T){if(!T||!k.length)return!0;let D=T.toLowerCase(),O=k.filter(C=>D.includes(C.toLowerCase())).length,h=k.length<=2?1:k.length===3?2:3;return O>=h},t=await i.DB.prepare("SELECT title_ko, title_en FROM works WHERE tmdb_id = ?").bind(r).first();if(!t?.title_ko)return console.log(`[YT_CRAWL] tmdb_id=${r} works \uC5C6\uC74C \u2014 \uC2A4\uD0B5`),0;let f=t.title_ko,e=t.title_en||"",o=await i.DB.prepare("SELECT platform, category_slot FROM rankings WHERE tmdb_id = ? ORDER BY date DESC LIMIT 1").bind(r).first(),n=new Set(["category07","category08"]),c=o?.platform==="netflix"&&n.has(o?.category_slot),d=c?"en":"ko",s=c&&e||f;console.log(`[YT_CRAWL] tmdb_id=${r} "${f}" \u2192 ${c?"\uC601\uC5B4":"\uD55C\uAD6D\uC5B4"} \uAC80\uC0C9 \uBAA8\uB4DC (slot=${o?.category_slot||"none"})`);let p=c?{netflix:"Netflix",tving:"Tving",disney:"Disney+",wavve:"Wavve",coupang:"Coupang Play",boxoffice:"Movie"}:{netflix:"\uB137\uD50C\uB9AD\uC2A4",tving:"\uD2F0\uBE59",disney:"\uB514\uC988\uB2C8\uD50C\uB7EC\uC2A4",wavve:"\uC6E8\uC774\uBE0C",coupang:"\uCFE0\uD321\uD50C\uB808\uC774",boxoffice:"\uC601\uD654"},u=o?.platform&&p[o.platform]||"",g=u?`${u} ${s}`:s,{results:m}=await i.DB.prepare("SELECT youtube_id, is_main FROM title_videos WHERE tmdb_id = ?").bind(r).all(),E=new Set(m.map(T=>T.youtube_id)),w=new Set(m.filter(T=>T.is_main===1).map(T=>T.youtube_id));w.size>0&&console.log(`[YT_CRAWL] tmdb_id=${r} \uBA54\uC778 \uC601\uC0C1 ${w.size}\uAC1C \uBCF4\uD638 \uC911`);let y=c?[`${g} official trailer`,`${g} trailer`]:[`${g} \uACF5\uC2DD \uC608\uACE0\uD3B8`,`${g} \uC608\uACE0\uD3B8`],k=s.replace(/[:\-·|]/g," ").replace(/[^\uAC00-\uD7A3a-zA-Z0-9\s]/g,"").split(/\s+/).filter(T=>T.length>=2),R=2,b=[];for(let T of y){if(b.length>=R)break;let D=`https://www.googleapis.com/youtube/v3/search?part=snippet&type=video&order=relevance&maxResults=8&relevanceLanguage=${d}&q=${encodeURIComponent(T)}&key=${i.YOUTUBE_API_KEY}`,O=await fetch(D),h=await O.json();if(!(!O.ok||!h.items?.length))for(let C of h.items){if(b.length>=R)break;let I=C.id?.videoId,J=C.snippet?.title||"";!I||E.has(I)||w.has(I)||S(J)&&(b.push({youtube_id:I,title:J||s,youtube_url:`https://www.youtube.com/watch?v=${I}`}),E.add(I))}}if(!b.length)return console.log(`[YT_CRAWL] tmdb_id=${r} "${g}" \uACB0\uACFC \uC5C6\uC74C (\uAD00\uB828\uC131 \uD544\uD130 \uD1B5\uACFC \uC601\uC0C1 \uC5C6\uC74C)`),0;for(let T of b)await i.DB.prepare(`
        INSERT OR IGNORE INTO title_videos (tmdb_id, youtube_url, youtube_id, title, is_main)
        VALUES (?, ?, ?, ?, 0)
      `).bind(r,T.youtube_url,T.youtube_id,T.title).run();return console.log(`[YT_CRAWL] \u2705 tmdb_id=${r} "${g}" ${b.length}\uAC1C \uC800\uC7A5`),b.length}catch(t){return console.error(`[YT_CRAWL] tmdb_id=${r} \uC624\uB958:`,t.message),0}}async function v(r,i){return Z(r,i)}async function q(r,i){let t=await Z(r,i);try{await i.DB.prepare("UPDATE works SET yt_crawl_attempted_at = datetime('now') WHERE tmdb_id = ?").bind(r).run()}catch(f){console.error(`[YT_CRAWL_BATCH] tmdb_id=${r} \uC2DC\uB3C4 \uC2DC\uAC01 \uAE30\uB85D \uC2E4\uD328:`,f.message)}return t}async function tt(r,i){try{let f=(await i.DB.prepare("SELECT media_type FROM works WHERE tmdb_id = ?").bind(r).first())?.media_type||"tv",e=[];try{e=(await(await fetch(`https://api.themoviedb.org/3/${f}/${r}/videos?language=ko-KR&api_key=${i.TMDB_API_KEY}`)).json()).results||[]}catch{}if(!e.length)try{e=(await(await fetch(`https://api.themoviedb.org/3/${f}/${r}/videos?language=en-US&api_key=${i.TMDB_API_KEY}`)).json()).results||[]}catch{}let o=e.filter(_=>_.site==="YouTube"),n=[...o.filter(_=>_.type==="Trailer"||_.type==="Teaser"),...o.filter(_=>_.type!=="Trailer"&&_.type!=="Teaser")];if(!n.length)return console.log(`[TMDB_SAVE] tmdb_id=${r} TMDB \uC601\uC0C1 \uC5C6\uC74C`),0;for(let _=0;_<n.length;_++){let c=n[_],d=_===0?1:0;await i.DB.prepare(`
        INSERT OR IGNORE INTO title_videos (tmdb_id, youtube_url, youtube_id, title, is_main)
        VALUES (?, ?, ?, ?, ?)
      `).bind(r,`https://www.youtube.com/watch?v=${c.key}`,c.key,c.name||"",d).run()}return console.log(`[TMDB_SAVE] \u2705 tmdb_id=${r} ${n.length}\uAC1C \uC800\uC7A5`),n.length}catch(t){return console.error(`[TMDB_SAVE] tmdb_id=${r} \uC624\uB958:`,t.message),0}}async function K(r,i,t,f){try{console.log(`[REACTION] \uB313\uAE00 \uC218\uC9D1 \uC2DC\uC791: reaction=${r} video=${i}`);let e="https://www.googleapis.com/youtube/v3/commentThreads?part=snippet&videoId="+i+"&maxResults=100&order=relevance&key="+f.YOUTUBE_API_KEY,o=await fetch(e),n=await o.json();if(!o.ok||!n.items?.length){console.error("[REACTION] YouTube API \uC624\uB958:",JSON.stringify(n).slice(0,200));return}let c=n.items.map(g=>{let m=g.snippet.topLevelComment.snippet;return{author:(m.authorDisplayName||"\uC775\uBA85").replace(/^@/,""),text:(m.textDisplay||"").replace(/<[^>]*>/g,"").trim(),likes:m.likeCount||0,published:m.publishedAt||""}}).filter(g=>g.text.length>5).sort((g,m)=>m.likes-g.likes).slice(0,50);if(!c.length)return;let s=`\uC544\uB798\uB294 YouTube \uC601\uC0C1\uC758 \uD574\uC678 \uB313\uAE00 \uBAA9\uB85D\uC785\uB2C8\uB2E4.
\uAC01 \uB313\uAE00\uC744 \uC790\uC5F0\uC2A4\uB7EC\uC6B4 \uD55C\uAD6D\uC5B4\uB85C \uBC88\uC5ED\uD558\uC138\uC694.

\uBC18\uB4DC\uC2DC \uC544\uB798 JSON \uD615\uC2DD\uC73C\uB85C\uB9CC \uC751\uB2F5\uD558\uC138\uC694 (\uB2E4\uB978 \uD14D\uC2A4\uD2B8 \uC5C6\uC774):
[
  {"idx": 0, "translated": "\uBC88\uC5ED\uB41C \uB313\uAE00"},
  ...
]

\uB313\uAE00 \uBAA9\uB85D:
`+c.map((g,m)=>m+1+". "+g.text.slice(0,300)).join(`
`),p=(await(await fetch("https://api.anthropic.com/v1/messages",{method:"POST",headers:{"Content-Type":"application/json","x-api-key":f.ANTHROPIC_API_KEY,"anthropic-version":"2023-06-01"},body:JSON.stringify({model:"claude-haiku-4-5-20251001",max_tokens:4e3,messages:[{role:"user",content:s}]})})).json()).content?.[0]?.text||"[]",u=[];try{let g=p.split("```json").join("").split("```").join("").trim(),m=JSON.parse(g);u=Array.isArray(m)?m:[]}catch{console.error("[REACTION] Claude \uC751\uB2F5 \uD30C\uC2F1 \uC2E4\uD328:",p.slice(0,300)),u=[]}await f.DB.prepare("DELETE FROM reaction_comments WHERE reaction_id = ?").bind(r).run();for(let g=0;g<c.length;g++){let m=c[g],w=(u.find(y=>y.idx===g)||u.find(y=>y.idx===g+1)||u[g]||{}).translated||"";await f.DB.prepare(`
        INSERT INTO reaction_comments
          (reaction_id, tmdb_id, original_text, translated_text, author, like_count, sentiment)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).bind(r,t,m.text.slice(0,1e3),w.slice(0,1e3),m.author.slice(0,100),m.likes,"neutral").run()}console.log(`[REACTION] \u2705 \uC644\uB8CC: reaction=${r} \uB313\uAE00 ${c.length}\uAC1C \uC800\uC7A5`)}catch(e){console.error("[REACTION] \uC624\uB958:",e.message)}}async function et(r,i,t,f,e,o){if(r.startsWith("/videos/")&&!r.includes("/admin")&&i.method==="GET"){let n=parseInt(r.split("/videos/")[1]);if(!n)return new Response(JSON.stringify({ok:!1,message:"tmdb_id required"}),{status:400,headers:o});try{let{results:_}=await t.DB.prepare("SELECT * FROM title_videos WHERE tmdb_id = ? ORDER BY is_main DESC, created_at DESC").bind(n).all();return _.length===0&&f.waitUntil(tt(n,t)),new Response(JSON.stringify({ok:!0,data:_}),{headers:o})}catch(_){return new Response(JSON.stringify({ok:!1,message:_.message}),{status:500,headers:o})}}if(r==="/admin/videos/crawl"&&i.method==="POST"){if(i.headers.get("Authorization")!==`Bearer ${t.ADMIN_SECRET}`)return new Response(JSON.stringify({ok:!1,message:"Unauthorized"}),{status:401,headers:o});try{let n=await i.json(),{tmdb_id:_}=n;if(!_)return new Response(JSON.stringify({ok:!1,message:"tmdb_id required"}),{status:400,headers:o});let c=await v(parseInt(_),t);return new Response(JSON.stringify({ok:!0,saved:c}),{headers:o})}catch(n){return new Response(JSON.stringify({ok:!1,message:n.message}),{status:500,headers:o})}}if(r==="/admin/videos/batch-crawl"&&i.method==="POST"){if(i.headers.get("Authorization")!==`Bearer ${t.ADMIN_SECRET}`)return new Response(JSON.stringify({ok:!1,message:"Unauthorized"}),{status:401,headers:o});try{let n=20;try{let w=await i.json();w?.limit&&Number.isInteger(w.limit)&&w.limit>0&&(n=w.limit)}catch{}let _=30,d=(await t.DB.prepare("SELECT COUNT(*) AS cnt FROM works WHERE yt_crawl_attempted_at >= date('now')").first())?.cnt||0;if(d>=_){let w=await t.DB.prepare(`
          SELECT COUNT(*) AS cnt
          FROM works w
          WHERE (
            SELECT COUNT(*) FROM title_videos tv WHERE tv.tmdb_id = w.tmdb_id
          ) <= 1
          AND (
            w.yt_crawl_attempted_at IS NULL
            OR w.yt_crawl_attempted_at < datetime('now', '-3 days')
          )
          AND (w.adult_flag IS NULL OR w.adult_flag != 1)
        `).first();return new Response(JSON.stringify({ok:!0,attempted:0,filled:0,remaining:w?.cnt||0,message:`\uC624\uB298 \uC608\uC0B0(${_}\uAC1C) \uC18C\uC9C4 \u2014 \uB0B4\uC77C \uB2E4\uC2DC \uC2DC\uB3C4\uD574\uC8FC\uC138\uC694`}),{headers:o})}let s=Math.min(n,_-d),l=(await t.DB.prepare("SELECT value AS latest_date FROM app_settings WHERE key = 'latest_ranking_date'").first())?.latest_date||null,{results:p}=await t.DB.prepare(`
        SELECT w.tmdb_id
        FROM works w
        WHERE (
          SELECT COUNT(*) FROM title_videos tv WHERE tv.tmdb_id = w.tmdb_id
        ) <= 1
        AND (
          w.yt_crawl_attempted_at IS NULL
          OR w.yt_crawl_attempted_at < datetime('now', '-3 days')
        )
        AND (w.adult_flag IS NULL OR w.adult_flag != 1)
        ORDER BY
          (
            EXISTS (
              SELECT 1 FROM rankings r
              WHERE r.tmdb_id = w.tmdb_id AND r.date = ?
            )
          ) DESC,
          w.created_at DESC
        LIMIT ?
      `).bind(l,s).all();if(!p.length)return new Response(JSON.stringify({ok:!0,attempted:0,filled:0,remaining:0,message:"\uB300\uC0C1 \uC791\uD488 \uC5C6\uC74C (\uBAA8\uB450 \uCFE8\uB2E4\uC6B4 \uC911\uC774\uAC70\uB098 \uC601\uC0C1\uC774 \uC774\uBBF8 \uCDA9\uBD84\uD568)"}),{headers:o});let u=[],g=0;for(let w of p)try{let y=await q(w.tmdb_id,t);g+=y,u.push({tmdb_id:w.tmdb_id,saved:y,ok:!0})}catch(y){console.error(`[BATCH_CRAWL] tmdb_id=${w.tmdb_id} \uC624\uB958:`,y.message),u.push({tmdb_id:w.tmdb_id,saved:0,ok:!1,error:y.message})}let E=(await t.DB.prepare(`
        SELECT COUNT(*) AS cnt
        FROM works w
        WHERE (
          SELECT COUNT(*) FROM title_videos tv WHERE tv.tmdb_id = w.tmdb_id
        ) <= 1
        AND (
          w.yt_crawl_attempted_at IS NULL
          OR w.yt_crawl_attempted_at < datetime('now', '-3 days')
        )
        AND (w.adult_flag IS NULL OR w.adult_flag != 1)
      `).first())?.cnt||0;return console.log(`[BATCH_CRAWL] \u2705 \uC644\uB8CC: \uC2DC\uB3C4 ${p.length}\uAC74, \uC800\uC7A5 ${g}\uAC1C, \uB0A8\uC74C ${E}`),new Response(JSON.stringify({ok:!0,attempted:p.length,filled:g,remaining:E,results:u}),{headers:o})}catch(n){return new Response(JSON.stringify({ok:!1,message:n.message}),{status:500,headers:o})}}if(r==="/admin/videos"&&i.method==="POST"){if(i.headers.get("Authorization")!==`Bearer ${t.ADMIN_SECRET}`)return new Response(JSON.stringify({ok:!1,message:"Unauthorized"}),{status:401,headers:o});try{let n=await i.json(),{tmdb_id:_,youtube_url:c}=n,{title:d}=n;if(!_||!c)return new Response(JSON.stringify({ok:!1,message:"tmdb_id, youtube_url required"}),{status:400,headers:o});let s=c.match(/(?:v=|youtu\.be\/|embed\/)([a-zA-Z0-9_-]{11})/);if(!s)return new Response(JSON.stringify({ok:!1,message:"\uC720\uD6A8\uD558\uC9C0 \uC54A\uC740 \uC720\uD29C\uBE0C URL"}),{status:400,headers:o});let a=s[1],l=await t.DB.prepare("SELECT id, title FROM title_videos WHERE tmdb_id = ? AND youtube_id = ? LIMIT 1").bind(_,a).first();if(l)return new Response(JSON.stringify({ok:!1,message:`\uC774\uBBF8 \uB4F1\uB85D\uB41C \uC601\uC0C1\uC785\uB2C8\uB2E4. (\uC81C\uBAA9: "${l.title||a}")`}),{status:409,headers:o});if(!d)try{d=(await(await fetch(`https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${a}&format=json`)).json()).title||""}catch{d=""}return await t.DB.prepare("INSERT INTO title_videos (tmdb_id, youtube_url, youtube_id, title, is_main) VALUES (?, ?, ?, ?, 0)").bind(_,c,a,d).run(),new Response(JSON.stringify({ok:!0}),{headers:o})}catch(n){return new Response(JSON.stringify({ok:!1,message:n.message}),{status:500,headers:o})}}if(r.match(/\/admin\/videos\/(\d+)\/main/)&&i.method==="PATCH"){if(i.headers.get("Authorization")!==`Bearer ${t.ADMIN_SECRET}`)return new Response(JSON.stringify({ok:!1,message:"Unauthorized"}),{status:401,headers:o});let n=parseInt(r.match(/\/admin\/videos\/(\d+)\/main/)[1]);try{let{results:_}=await t.DB.prepare("SELECT tmdb_id FROM title_videos WHERE id = ?").bind(n).all();if(!_.length)return new Response(JSON.stringify({ok:!1,message:"\uC5C6\uC74C"}),{status:404,headers:o});let c=_[0].tmdb_id;return await t.DB.batch([t.DB.prepare("UPDATE title_videos SET is_main = 0 WHERE tmdb_id = ?").bind(c),t.DB.prepare("UPDATE title_videos SET is_main = 1 WHERE id = ?").bind(n)]),new Response(JSON.stringify({ok:!0}),{headers:o})}catch(_){return new Response(JSON.stringify({ok:!1,message:_.message}),{status:500,headers:o})}}if(r.match(/\/admin\/videos\/(\d+)$/)&&i.method==="DELETE"){if(i.headers.get("Authorization")!==`Bearer ${t.ADMIN_SECRET}`)return new Response(JSON.stringify({ok:!1,message:"Unauthorized"}),{status:401,headers:o});let n=parseInt(r.match(/\/admin\/videos\/(\d+)$/)[1]);try{return await t.DB.prepare("DELETE FROM title_videos WHERE id = ?").bind(n).run(),new Response(JSON.stringify({ok:!0}),{headers:o})}catch(_){return new Response(JSON.stringify({ok:!1,message:_.message}),{status:500,headers:o})}}if(r.startsWith("/imdb/")&&r!=="/imdb/save"&&i.method==="GET"){let n=r.split("/imdb/")[1];if(!n||!/^tt\d+$/.test(n))return new Response(JSON.stringify({ok:!1,message:"invalid imdb_id"}),{status:400,headers:o});try{let _=await t.DB.prepare("SELECT imdb_rating, imdb_votes, imdb_updated FROM works WHERE imdb_id = ? LIMIT 1").bind(n).first();if(_?.imdb_rating){let a=new Date(_.imdb_updated||0);if((Date.now()-a.getTime())/(1e3*60*60*24)<7)return new Response(JSON.stringify({ok:!0,source:"cache",rating:_.imdb_rating.toFixed(1),votes:_.imdb_votes||""}),{headers:o})}let c=t.OMDB_API_KEY;if(!c)return new Response(JSON.stringify({ok:!1,message:"OMDB key not configured"}),{status:500,headers:o});let s=await(await fetch(`https://www.omdbapi.com/?i=${n}&apikey=${c}`)).json();if(s.Response!=="False"){let a=parseFloat(s.imdbRating);if(!isNaN(a)){let l=s.imdbVotes||"",p=new Date().toISOString();return await t.DB.prepare("UPDATE works SET imdb_rating = ?, imdb_votes = ?, imdb_updated = ? WHERE imdb_id = ?").bind(a,l,p,n).run(),new Response(JSON.stringify({ok:!0,source:"omdb",rating:a.toFixed(1),votes:l}),{headers:o})}}return new Response(JSON.stringify({ok:!1,message:"rating not available"}),{status:404,headers:o})}catch(_){return console.error("[IMDB GET]",_),new Response(JSON.stringify({ok:!1,message:_.message}),{status:500,headers:o})}}if(r==="/imdb/save"&&i.method==="POST")try{let n=await i.json(),{tmdb_id:_,imdb_id:c}=n;return!_||!c?new Response(JSON.stringify({ok:!1,message:"tmdb_id and imdb_id required"}),{status:400,headers:o}):/^tt\d+$/.test(c)?(await t.DB.prepare("UPDATE works SET imdb_id = ? WHERE tmdb_id = ?").bind(c,parseInt(_)).run(),new Response(JSON.stringify({ok:!0}),{headers:o})):new Response(JSON.stringify({ok:!1,message:"invalid imdb_id format"}),{status:400,headers:o})}catch(n){return console.error("[IMDB SAVE]",n),new Response(JSON.stringify({ok:!1,message:n.message}),{status:500,headers:o})}if(r==="/youtube/trending"&&i.method==="GET")try{let{results:n}=await t.DB.prepare("SELECT * FROM youtube_trending ORDER BY rank ASC").all();if(n.length>0){let p=new Date(n[0].collected_at);if((Date.now()-p.getTime())/(1e3*60*60)<6)return new Response(JSON.stringify({ok:!0,data:n,cached:!0}),{headers:o})}let _=`https://www.googleapis.com/youtube/v3/videos?part=snippet,statistics&chart=mostPopular&regionCode=KR&maxResults=50&key=${t.YOUTUBE_API_KEY}`,c=await fetch(_),d=await c.json();if(!c.ok||!d.items?.length)return n.length>0?new Response(JSON.stringify({ok:!0,data:n,cached:!0}),{headers:o}):new Response(JSON.stringify({ok:!1,message:"YouTube API \uC624\uB958"}),{status:500,headers:o});let s=new Date().toISOString(),a=d.items.map((p,u)=>({rank:u+1,video_id:p.id,title:p.snippet?.title||"",channel:p.snippet?.channelTitle||"",thumbnail:p.snippet?.thumbnails?.medium?.url||p.snippet?.thumbnails?.default?.url||"",view_count:parseInt(p.statistics?.viewCount||0),collected_at:s}));await t.DB.prepare("DELETE FROM youtube_trending").run();let l=a.map(p=>t.DB.prepare(`
          INSERT INTO youtube_trending (rank, video_id, title, channel, thumbnail, view_count, collected_at)
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `).bind(p.rank,p.video_id,p.title,p.channel,p.thumbnail,p.view_count,p.collected_at));return await t.DB.batch(l),new Response(JSON.stringify({ok:!0,data:a,cached:!1}),{headers:o})}catch(n){return new Response(JSON.stringify({ok:!1,message:n.message}),{status:500,headers:o})}if(r==="/works/register"&&i.method==="POST")try{let n=await i.json(),{tmdb_id:_,title_ko:c,title_en:d,poster_path:s,media_type:a,genre:l,original_language:p,tmdb_rating:u,release_date:g}=n;if(!_||!c)return new Response(JSON.stringify({ok:!1,message:"tmdb_id, title_ko required"}),{status:400,headers:o});let m=d&&/[\uAC00-\uD7A3]/.test(d),w=d&&/[a-zA-Z]/.test(d)&&!m?d:null,y=u??null,k=g||null,S=new Date().toISOString();return await t.DB.prepare(`
        INSERT INTO works (
          tmdb_id, title_ko, title_en, poster_path, media_type, genre, original_language,
          tmdb_rating, release_date, rating_updated_at, match_source
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'user')
        ON CONFLICT(tmdb_id) DO UPDATE SET
          -- media_type: title_en\uACFC \uB2EC\uB9AC "\uBCF4\uD638 \uB300\uC0C1 \uC544\uB2D8" \u2014 \uD655\uC2E0 \uC788\uB294 \uAC12(NULL \uC544\uB2D8)\uC774 \uC624\uBA74 \uD56D\uC0C1 \uCD5C\uC2E0\uD654.
          -- movie/tv tmdb_id\uAC00 \uC6B0\uC5F0\uD788 \uACB9\uCCD0 \uD55C \uBC88 \uC798\uBABB \uC800\uC7A5\uB3FC\uB3C4, \uC774\uD6C4 \uC2E0\uB8B0 \uAC00\uB2A5\uD55C \uAC12\uC774 \uB4E4\uC5B4\uC624\uBA74
          -- \uC790\uB3D9\uC73C\uB85C \uC2A4\uC2A4\uB85C \uACE0\uCCD0\uC9C0\uB294 \uC790\uAC00\uCE58\uC720(self-healing) \uAD6C\uC870 (2026-07-07)
          media_type = CASE
            WHEN excluded.media_type IS NOT NULL AND excluded.media_type != ''
              THEN excluded.media_type
            ELSE works.media_type
          END,
          -- title_en \uC5C5\uB370\uC774\uD2B8 \uC870\uAC74:
          --   1) \uD604\uC7AC title_en\uC774 \uBE44\uC5B4\uC788\uC744 \uB54C
          --   2) \uD604\uC7AC title_en\uC774 \uD55C\uAE00\uC77C \uB54C (\uC798\uBABB \uC785\uB825\uB41C \uACBD\uC6B0)
          -- \uD604\uC7AC title_en\uC774 \uC774\uBBF8 \uC601\uC5B4\uBA74 \uC808\uB300 \uAC74\uB4DC\uB9AC\uC9C0 \uC54A\uC74C (flixpatrol \uAE30\uC900 \uBCF4\uD638)
          title_en = CASE
            WHEN excluded.title_en IS NULL OR excluded.title_en = ''
              THEN works.title_en
            WHEN works.title_en IS NULL OR works.title_en = ''
              THEN excluded.title_en
            WHEN works.title_en = works.title_ko
              THEN excluded.title_en
            ELSE works.title_en
          END,
          -- genre: \uBE44\uC5B4\uC788\uC744 \uB54C\uB9CC \uC5C5\uB370\uC774\uD2B8 (\uAE30\uC874 \uB370\uC774\uD130 \uBCF4\uD638)
          genre = CASE
            WHEN works.genre IS NULL OR works.genre = ''
              THEN excluded.genre
            ELSE works.genre
          END,
          -- original_language: \uBE44\uC5B4\uC788\uC744 \uB54C\uB9CC \uC5C5\uB370\uC774\uD2B8 (genre\uC640 \uB3D9\uC77C \uC6D0\uCE59)
          original_language = CASE
            WHEN works.original_language IS NULL OR works.original_language = ''
              THEN excluded.original_language
            ELSE works.original_language
          END,
          -- tmdb_rating / release_date: title_en\uACFC \uB2EC\uB9AC "\uBCF4\uD638 \uB300\uC0C1 \uC544\uB2D8" \u2014 \uAC12\uC774 \uC624\uBA74 \uD56D\uC0C1 \uCD5C\uC2E0\uD654
          -- COALESCE(excluded.\uAC12, works.\uAE30\uC874\uAC12): \uD504\uB860\uD2B8\uAC00 \uAC12\uC744 \uBABB \uBCF4\uB0C8\uC744 \uB54C\uB9CC \uAE30\uC874 \uAC12 \uBCF4\uC874,
          -- 0\uC740 NULL\uC774 \uC544\uB2C8\uBBC0\uB85C COALESCE\uAC00 \uC815\uC0C1\uAC12\uC73C\uB85C \uADF8\uB300\uB85C \uBC18\uC601\uD568
          tmdb_rating = COALESCE(excluded.tmdb_rating, works.tmdb_rating),
          release_date = COALESCE(excluded.release_date, works.release_date),
          -- rating_updated_at: \uC774 \uB4F1\uB85D \uC694\uCCAD\uC774 \uB4E4\uC5B4\uC628 \uC2DC\uC810 = \uBC29\uBB38\uC790\uAC00 TMDB\uB97C \uC870\uD68C\uD574\uC628 \uC2DC\uC810\uC774\uBBC0\uB85C
          -- \uB9E4 \uD638\uCD9C\uB9C8\uB2E4 \uBB34\uC870\uAC74 \uCD5C\uC2E0 \uC2DC\uAC01\uC73C\uB85C \uAC31\uC2E0 (\uC2E0\uC791 1\uC77C / \uAD6C\uC791 5\uC77C \uC8FC\uAE30 \uD310\uB2E8\uC758 \uAE30\uC900\uAC12)
          rating_updated_at = excluded.rating_updated_at
      `).bind(parseInt(_),c||null,w||null,s||null,a||null,l||null,p||null,y,k,S).run(),new Response(JSON.stringify({ok:!0}),{headers:o})}catch(n){return new Response(JSON.stringify({ok:!1,message:n.message}),{status:500,headers:o})}if(r.startsWith("/works/variety-similar/")&&i.method==="GET"){let n=parseInt(r.split("/works/variety-similar/")[1]);if(!n)return new Response(JSON.stringify({ok:!1,message:"tmdb_id required"}),{status:400,headers:o});let _=Math.min(parseInt(e.searchParams.get("limit")||"10"),20);try{let d=((await t.DB.prepare("SELECT variety_genre FROM works WHERE tmdb_id = ?").bind(n).first())?.variety_genre||"").split(",").map(p=>p.trim()).filter(Boolean);if(!d.length)return new Response(JSON.stringify({ok:!0,data:[]}),{headers:o});let{results:s}=await t.DB.prepare(`
        SELECT tmdb_id, title_ko, title_en, poster_path, tmdb_rating, release_year, variety_genre, media_type
        FROM works
        WHERE variety_genre IS NOT NULL AND variety_genre != '' AND tmdb_id != ?
      `).bind(n).all(),a=new Map;try{let p=await t.DB.prepare("SELECT value as d FROM app_settings WHERE key = 'latest_ranking_date'").first();if(p?.d){let{results:u}=await t.DB.prepare(`
            SELECT tmdb_id, COUNT(DISTINCT platform) as cnt
            FROM rankings
            WHERE date = ?
            GROUP BY tmdb_id
          `).bind(p.d).all();for(let g of u)a.set(g.tmdb_id,g.cnt)}}catch{}let l=[];for(let p of s){let u=(p.variety_genre||"").split(",").map(y=>y.trim()).filter(Boolean),g=d.filter(y=>u.includes(y)).length;if(!g)continue;let m=null;if(d.length===2?m=g===2?92:82:d.length===1&&(m=g===1?87:null),!m)continue;let E=a.get(p.tmdb_id)||0,w=Math.min(m+E,99);l.push({tmdb_id:p.tmdb_id,title_ko:p.title_ko,title_en:p.title_en,poster_path:p.poster_path,tmdb_rating:p.tmdb_rating,release_year:p.release_year,match_pct:w,media_type:p.media_type||null})}return l.sort((p,u)=>u.match_pct-p.match_pct||(u.release_year||0)-(p.release_year||0)||(u.tmdb_rating||0)-(p.tmdb_rating||0)),new Response(JSON.stringify({ok:!0,data:l.slice(0,_)}),{headers:o})}catch(c){return new Response(JSON.stringify({ok:!1,message:c.message}),{status:500,headers:o})}}if(r.startsWith("/works/")&&i.method==="GET"){let n=r.split("/works/")[1];if(!n)return new Response(JSON.stringify({ok:!1,message:"tmdb_id required"}),{status:400,headers:o});let{results:_}=await t.DB.prepare("SELECT * FROM works WHERE tmdb_id = ?").bind(parseInt(n)).all();if(!_.length)return new Response(JSON.stringify({ok:!1,message:"Not found"}),{status:404,headers:o});let c={..._[0]};if(!c.mbti_tags&&c.genre){let g=Mt(c.genre);g&&(f.waitUntil(t.DB.prepare("UPDATE works SET mbti_tags = ? WHERE tmdb_id = ?").bind(g,parseInt(n)).run()),c.mbti_tags=g)}let d=7200*60*1e3,s=2400*60*60*1e3,a=!1;try{let{results:g}=await t.DB.prepare(`
        SELECT 1 FROM rankings
        WHERE tmdb_id = ? AND date = (SELECT value FROM app_settings WHERE key = 'latest_ranking_date')
        LIMIT 1
      `).bind(parseInt(n)).all();a=!!(g&&g.length)}catch{a=!1}let l=a?d:s;if(!c.keyword_preview_updated_at||Date.now()-new Date(c.keyword_preview_updated_at).getTime()>l){let g={keyword:null,items:[]};if(c.keywords&&c.keywords!=="__NONE__"){let E=c.keywords.split(",").map(w=>w.trim()).filter(Boolean).slice(0,10);if(E.length)try{let w=E.map(k=>t.DB.prepare(`
                SELECT w.tmdb_id, w.title_ko, w.title_en, w.poster_path, w.original_language, w.tmdb_rating
                FROM work_keywords wk
                JOIN works w ON w.tmdb_id = wk.tmdb_id
                WHERE wk.keyword = ?
                  AND wk.tmdb_id != ?
                  AND (w.adult_flag IS NULL OR w.adult_flag != 1)
                ORDER BY
                  CASE WHEN w.original_language = 'ko' THEN 0 ELSE 1 END,
                  w.tmdb_rating DESC
                LIMIT 20
              `).bind(k.toLowerCase(),parseInt(n))),y=await t.DB.batch(w);for(let k=0;k<E.length;k++){let S=y[k]?.results||[];if(S.length>=3){g={keyword:E[k],items:S};break}}}catch{}}let m=new Date().toISOString();c.keyword_preview=JSON.stringify(g),c.keyword_preview_updated_at=m,f.waitUntil(t.DB.prepare("UPDATE works SET keyword_preview = ?, keyword_preview_updated_at = ? WHERE tmdb_id = ?").bind(c.keyword_preview,m,parseInt(n)).run())}try{let{results:g}=await t.DB.prepare(`
        SELECT w.tmdb_id, w.title_ko, w.title_en, w.poster_path, w.release_year, w.media_type, p.pinned_pct
        FROM work_pinned_similar p
        JOIN works w ON w.tmdb_id = p.related_tmdb_id
        WHERE p.tmdb_id = ?
        ORDER BY p.pinned_pct DESC
      `).bind(parseInt(n)).all();c.pinned_similar=g||[]}catch{c.pinned_similar=[]}if(!c.keyword_ko_map_updated_at||Date.now()-new Date(c.keyword_ko_map_updated_at).getTime()>l){let g={},m=!1;if(c.keywords&&c.keywords!=="__NONE__"){let E=c.keywords.split(",").map(w=>w.trim().toLowerCase()).filter(Boolean);if(E.length)try{let w=E.map(()=>"?").join(","),{results:y}=await t.DB.prepare(`SELECT keyword_en, keyword_ko FROM keyword_translation WHERE keyword_en IN (${w}) AND source = 'admin'`).bind(...E).all();for(let k of y||[])g[k.keyword_en]=k.keyword_ko}catch{m=!0}}if(c.keyword_ko_map=g,!m){let E=new Date().toISOString();f.waitUntil(t.DB.prepare("UPDATE works SET keyword_ko_map = ?, keyword_ko_map_updated_at = ? WHERE tmdb_id = ?").bind(JSON.stringify(g),E,parseInt(n)).run())}}else try{c.keyword_ko_map=c.keyword_ko_map?JSON.parse(c.keyword_ko_map):{}}catch{c.keyword_ko_map={}}return new Response(JSON.stringify({ok:!0,data:c}),{headers:o})}if(r==="/search/keyword"&&i.method==="GET"){let n=(e.searchParams.get("keyword")||"").trim().toLowerCase(),_=Math.min(parseInt(e.searchParams.get("limit")||"20"),40);if(!n)return new Response(JSON.stringify({ok:!1,message:"keyword required"}),{status:400,headers:o});try{let{results:c}=await t.DB.prepare(`
        SELECT w.tmdb_id, w.title_ko, w.title_en, w.poster_path, w.genre, w.tmdb_rating, w.media_type, w.original_language
        FROM work_keywords wk
        JOIN works w ON w.tmdb_id = wk.tmdb_id
        WHERE wk.keyword = ?
          AND (w.adult_flag IS NULL OR w.adult_flag != 1)
        ORDER BY
          CASE WHEN w.original_language = 'ko' THEN 0 ELSE 1 END,
          w.tmdb_rating DESC
        LIMIT ?
      `).bind(n,_).all();return new Response(JSON.stringify({ok:!0,keyword:n,data:c}),{headers:o})}catch(c){return new Response(JSON.stringify({ok:!1,message:c.message}),{status:500,headers:o})}}return null}function Mt(r){if(!r)return null;let i=new Set(["Reality","Talk","News","Soap","Documentary","Kids","\uB2E4\uD050\uBA58\uD130\uB9AC","\uB9AC\uC5BC\uB9AC\uD2F0"]),t=r.split(",").map(s=>s.trim()).filter(Boolean);if(!t.length||!t.filter(s=>!i.has(s)).length)return null;let e=s=>s===0?5:s===1?3:s===2?2:1,o={INTJ:{primary:["Science Fiction","Sci-Fi & Fantasy","SF"],secondary:["Drama","\uB4DC\uB77C\uB9C8","Thriller","\uC2A4\uB9B4\uB7EC"]},INTP:{primary:["Science Fiction","Sci-Fi & Fantasy","SF"],secondary:["Thriller","Mystery","\uC2A4\uB9B4\uB7EC","\uBBF8\uC2A4\uD130\uB9AC"]},ENTJ:{primary:["Drama","\uB4DC\uB77C\uB9C8"],secondary:["Science Fiction","Sci-Fi & Fantasy","SF"]},ENTP:{primary:["Science Fiction","Sci-Fi & Fantasy","SF"],secondary:["Action","Action & Adventure","\uC561\uC158","Adventure","\uBAA8\uD5D8"]},INFJ:{primary:["Thriller","Mystery","\uC2A4\uB9B4\uB7EC","\uBBF8\uC2A4\uD130\uB9AC"],secondary:["Drama","\uB4DC\uB77C\uB9C8","Crime","\uBC94\uC8C4"]},INFP:{primary:["Fantasy","Sci-Fi & Fantasy","\uD310\uD0C0\uC9C0"],secondary:["Drama","\uB4DC\uB77C\uB9C8","Animation","\uC560\uB2C8\uBA54\uC774\uC158"]},ENFJ:{primary:["Fantasy","Sci-Fi & Fantasy","\uD310\uD0C0\uC9C0"],secondary:["Drama","\uB4DC\uB77C\uB9C8","Family","\uAC00\uC871"]},ENFP:{primary:["Drama","\uB4DC\uB77C\uB9C8"],secondary:["Comedy","\uCF54\uBBF8\uB514","Fantasy","\uD310\uD0C0\uC9C0"]},ISTJ:{primary:["Drama","\uB4DC\uB77C\uB9C8"],secondary:["Action","Action & Adventure","\uC561\uC158","History","\uC5ED\uC0AC","War","War & Politics","\uC804\uC7C1"]},ISFJ:{primary:["Comedy","\uCF54\uBBF8\uB514"],secondary:["Romance","\uB85C\uB9E8\uC2A4","Family","\uAC00\uC871","Drama","\uB4DC\uB77C\uB9C8"]},ESTJ:{primary:["Action","Action & Adventure","\uC561\uC158"],secondary:["Drama","\uB4DC\uB77C\uB9C8","History","\uC5ED\uC0AC","War","War & Politics","\uC804\uC7C1"]},ESFJ:{primary:["Action","Action & Adventure","\uC561\uC158"],secondary:["Comedy","\uCF54\uBBF8\uB514","Family","\uAC00\uC871","Romance","\uB85C\uB9E8\uC2A4"]},ISTP:{primary:["Horror","Thriller","\uACF5\uD3EC","\uC2A4\uB9B4\uB7EC"],secondary:["Action","Action & Adventure","\uC561\uC158","Crime","\uBC94\uC8C4"]},ISFP:{primary:["Drama","\uB4DC\uB77C\uB9C8"],secondary:["Animation","\uC560\uB2C8\uBA54\uC774\uC158","Romance","\uB85C\uB9E8\uC2A4","Music","\uC74C\uC545"]},ESTP:{primary:["Action","Action & Adventure","\uC561\uC158"],secondary:["Thriller","Mystery","Crime","\uC2A4\uB9B4\uB7EC","\uBBF8\uC2A4\uD130\uB9AC","\uBC94\uC8C4"]},ESFP:{primary:["Comedy","\uCF54\uBBF8\uB514"],secondary:["Action","Action & Adventure","\uC561\uC158","Romance","\uB85C\uB9E8\uC2A4"]}},n={};for(let[s,a]of Object.entries(o)){let l=0;t.forEach((p,u)=>{let g=e(u);a.primary.includes(p)?l+=g*3:a.secondary.includes(p)&&(l+=g*1)}),l>0&&(n[s]=l)}if(!Object.keys(n).length)return null;let _=parseInt(r.split("").reduce((s,a)=>s+a.charCodeAt(0),0)),c=s=>{let a=Math.sin(_+s*127)*43758.5453;return a-Math.floor(a)},d=Object.entries(n);return d.sort((s,a)=>{if(a[1]!==s[1])return a[1]-s[1];let l=d.indexOf(s),p=d.indexOf(a);return c(l)-c(p)}),d.slice(0,5).map(([s])=>s).join(",")}function it(r,i,t){let f=i.replace(/\s+/g,"");return[r.DB.prepare(`
      SELECT tmdb_id FROM works
      WHERE REPLACE(title_ko, ' ', '') LIKE ? OR REPLACE(title_en, ' ', '') LIKE ?
      LIMIT ?
    `).bind(`%${f}%`,`%${f}%`,t),r.DB.prepare(`
      SELECT DISTINCT wk.tmdb_id
      FROM keyword_translation kt
      CROSS JOIN work_keywords wk ON wk.keyword = kt.keyword_en
      WHERE kt.keyword_ko LIKE ('%' || ? || '%')
         OR kt.keyword_ko_2 LIKE ('%' || ? || '%')
         OR kt.keyword_ko_3 LIKE ('%' || ? || '%')
      LIMIT ?
    `).bind(i,i,i,t),r.DB.prepare(`
      SELECT tmdb_id FROM works
      WHERE (',' || REPLACE(genre, ', ', ',') || ',') LIKE ('%,' || ? || ',%')
        AND (adult_flag IS NULL OR adult_flag != 1)
        AND poster_path IS NOT NULL AND poster_path != ''
      ORDER BY (original_language = 'ko') DESC, tmdb_rating DESC
      LIMIT ?
    `).bind(i,t)]}async function st(r,i,t){try{let f=await fetch(`https://api.themoviedb.org/3/search/${i}?query=${encodeURIComponent(t)}&language=ko-KR&include_adult=false&api_key=${r.TMDB_API_KEY}`);return f.ok?((await f.json()).results||[]).filter(o=>!o.adult).map(o=>({...o,_type:i,tmdb_id:o.id})):[]}catch{return[]}}async function Ht(r,i,t,f){let o=i.flatMap(m=>it(r,m,30)),[n,..._]=await Promise.all([r.DB.batch(o),...i.flatMap(m=>[st(r,"tv",m),st(r,"movie",m)])]),c=new Set;n.forEach(m=>(m.results||[]).forEach(E=>c.add(E.tmdb_id)));let d=[...c].filter(m=>!t.has(m)),s=[];if(d.length){let m=d.map(()=>"?").join(",");s=(await r.DB.prepare(`
      SELECT tmdb_id, title_ko, title_en, poster_path, media_type, release_year, tmdb_rating, original_language
      FROM works
      WHERE tmdb_id IN (${m})
        AND (adult_flag IS NULL OR adult_flag != 1)
        AND poster_path IS NOT NULL AND poster_path != ''
    `).bind(...d).all()).results}let a=[],l=new Set;s.forEach(m=>{l.has(m.tmdb_id)||t.has(m.tmdb_id)||(l.add(m.tmdb_id),a.push(m))});let p=_.flat(),u=[...new Set(p.map(m=>m.tmdb_id).filter(Boolean))],g=new Set;if(u.length){let m=u.map(()=>"?").join(","),{results:E}=await r.DB.prepare(`SELECT tmdb_id FROM works WHERE tmdb_id IN (${m})`).bind(...u).all();g=new Set(E.map(w=>w.tmdb_id))}return p.forEach(m=>{let E=m.tmdb_id;!E||l.has(E)||t.has(E)||g.has(E)||!m.poster_path||(l.add(E),a.push({tmdb_id:E,title_ko:m.name||m.title||"",title_en:m.original_name||m.original_title||"",poster_path:m.poster_path,media_type:m._type,release_year:parseInt((m.first_air_date||m.release_date||"").slice(0,4))||null,tmdb_rating:m.vote_average||null,original_language:m.original_language||null}))}),a.sort((m,E)=>{let w=m.original_language==="ko"?0:1,y=E.original_language==="ko"?0:1;return w!==y?w-y:(E.tmdb_rating||0)-(m.tmdb_rating||0)}),a.slice(0,f)}async function at(r,i,t,f,e){if(r==="/works/search"&&i.method==="GET"){let o=f.searchParams.get("q")||"",n=Math.min(parseInt(f.searchParams.get("limit")||"15"),30),_=Math.max(parseInt(f.searchParams.get("offset")||"0"),0),c=100,d=15,s=24;if(!o.trim())return new Response(JSON.stringify({ok:!1,message:"q required"}),{status:400,headers:e});try{let[a,l,p]=await t.DB.batch(it(t,o,c)),u=new Map;a.results.forEach(R=>u.set(R.tmdb_id,0)),l.results.forEach(R=>{u.has(R.tmdb_id)||u.set(R.tmdb_id,1)}),p.results.forEach(R=>{u.has(R.tmdb_id)||u.set(R.tmdb_id,1)});let g=u.size>c,m=[...u.keys()].slice(0,c),E=[];if(m.length){let R=m.map(()=>"?").join(",");E=(await t.DB.prepare(`
          SELECT tmdb_id, title_ko, title_en, poster_path, media_type, release_year, tmdb_rating, original_language
          FROM works
          WHERE tmdb_id IN (${R})
            AND (adult_flag IS NULL OR adult_flag != 1)
            AND poster_path IS NOT NULL AND poster_path != ''
        `).bind(...m).all()).results}if(E.length<d){let R=[...new Set(o.split(/\s+/).filter(b=>b.length>=2))];R.length>=2&&(await Ht(t,R,new Set(u.keys()),s)).forEach(T=>{u.set(T.tmdb_id,3),E.push(T)})}let w=E.length;E.sort((R,b)=>{let T=u.get(R.tmdb_id)??1,D=u.get(b.tmdb_id)??1;if(T!==D)return T-D;let O=R.original_language==="ko"?0:1,h=b.original_language==="ko"?0:1;return O!==h?O-h:(b.tmdb_rating||0)-(R.tmdb_rating||0)});let y=E.slice(_,_+n),k=E.length>_+n,S=[];if(y.length){let R=y.map(O=>O.tmdb_id),b=R.map(()=>"?").join(","),{results:T}=await t.DB.prepare(`
          SELECT tmdb_id, platform, rank
          FROM rankings
          WHERE tmdb_id IN (${b})
            AND date = (SELECT value FROM app_settings WHERE key = 'latest_ranking_date')
        `).bind(...R).all(),D={};T.forEach(O=>{D[O.tmdb_id]||(D[O.tmdb_id]={}),D[O.tmdb_id][O.platform]=O.rank}),S=y.map(O=>({...O,ott_ranks:D[O.tmdb_id]||{}}))}return new Response(JSON.stringify({ok:!0,data:S,has_more:k,limit:n,offset:_,total:w,capped:g}),{headers:e})}catch(a){return new Response(JSON.stringify({ok:!1,message:a.message}),{status:500,headers:e})}}if(r==="/works/exists"&&i.method==="GET"){let n=(f.searchParams.get("ids")||"").split(",").map(_=>parseInt(_.trim())).filter(_=>Number.isInteger(_)).slice(0,100);if(!n.length)return new Response(JSON.stringify({ok:!0,existing_ids:[]}),{headers:e});try{let _=n.map(()=>"?").join(","),{results:c}=await t.DB.prepare(`
        SELECT tmdb_id FROM works WHERE tmdb_id IN (${_})
      `).bind(...n).all();return new Response(JSON.stringify({ok:!0,existing_ids:c.map(d=>d.tmdb_id)}),{headers:e})}catch(_){return new Response(JSON.stringify({ok:!1,message:_.message}),{status:500,headers:e})}}return null}async function rt(r,i,t,f,e){if(r==="/reactions"&&i.method==="GET"){let o=new URL(i.url),n=o.searchParams.get("tmdb_id"),_=o.searchParams.get("featured"),c=parseInt(o.searchParams.get("page")||"1"),d=20,s=(c-1)*d,a,l;_==="1"?(a="SELECT * FROM reactions WHERE is_featured = 1 ORDER BY created_at DESC LIMIT 1",l=[]):n?(a="SELECT * FROM reactions WHERE tmdb_id = ? ORDER BY is_featured DESC, like_count DESC, created_at DESC",l=[parseInt(n)]):(a="SELECT * FROM reactions ORDER BY is_featured DESC, created_at DESC LIMIT ? OFFSET ?",l=[d,s]);let{results:p}=l.length?await t.DB.prepare(a).bind(...l).all():await t.DB.prepare(a).all();return new Response(JSON.stringify({ok:!0,data:p}),{headers:e})}if(r.match(/^\/reactions\/work\/\d+$/)&&i.method==="GET")try{let o=parseInt(r.split("/")[3]),n=["great","good","meh","bad"],{results:_}=await t.DB.prepare(`
        SELECT reaction, COUNT(*) as cnt
        FROM work_reactions
        WHERE tmdb_id = ?
        GROUP BY reaction
      `).bind(o).all(),c=_.reduce((p,u)=>p+u.cnt,0),d={};n.forEach(p=>d[p]=0),_.forEach(p=>{n.includes(p.reaction)&&(d[p.reaction]=p.cnt)});let s={};if(c>0){let p=0,u=n.map(g=>({k:g,raw:d[g]/c*100}));u.forEach((g,m)=>{m<u.length-1?(s[g.k]=Math.round(g.raw),p+=s[g.k]):s[g.k]=100-p})}else n.forEach(p=>s[p]=0);let a=null,l=i.headers.get("Authorization")?.replace("Bearer ","")||(()=>{let u=(i.headers.get("Cookie")||"").match(/session=([^;]+)/);return u?u[1]:null})();if(l){let p=await t.DB.prepare("SELECT user_id FROM sessions WHERE id = ? AND expires_at > datetime('now') LIMIT 1").bind(l).first();p?.user_id&&(a=(await t.DB.prepare("SELECT reaction FROM work_reactions WHERE tmdb_id = ? AND user_id = ? LIMIT 1").bind(o,p.user_id).first())?.reaction||null)}return new Response(JSON.stringify({ok:!0,data:{total:c,counts:d,ratios:s,my_reaction:a}}),{headers:e})}catch(o){return new Response(JSON.stringify({ok:!1,message:o.message}),{status:500,headers:e})}if(r==="/reactions/work"&&i.method==="POST")try{let o=i.headers.get("Authorization")?.replace("Bearer ","")||(()=>{let y=(i.headers.get("Cookie")||"").match(/session=([^;]+)/);return y?y[1]:null})();if(!o)return new Response(JSON.stringify({ok:!1,message:"\uB85C\uADF8\uC778\uC774 \uD544\uC694\uD569\uB2C8\uB2E4"}),{status:401,headers:e});let n=await t.DB.prepare("SELECT user_id FROM sessions WHERE id = ? AND expires_at > datetime('now') LIMIT 1").bind(o).first();if(!n?.user_id)return new Response(JSON.stringify({ok:!1,message:"\uC138\uC158\uC774 \uB9CC\uB8CC\uB410\uC2B5\uB2C8\uB2E4"}),{status:401,headers:e});let _=await i.json(),{tmdb_id:c,reaction:d}=_,s=["great","good","meh","bad"];if(!c||!s.includes(d))return new Response(JSON.stringify({ok:!1,message:"\uC62C\uBC14\uB974\uC9C0 \uC54A\uC740 \uC694\uCCAD\uC785\uB2C8\uB2E4"}),{status:400,headers:e});let a=n.user_id;await t.DB.prepare(`
        INSERT INTO work_reactions (tmdb_id, user_id, reaction, updated_at)
        VALUES (?, ?, ?, datetime('now'))
        ON CONFLICT(tmdb_id, user_id)
        DO UPDATE SET reaction = excluded.reaction, updated_at = datetime('now')
      `).bind(parseInt(c),a,d).run();let{results:l}=await t.DB.prepare(`
        SELECT reaction, COUNT(*) as cnt
        FROM work_reactions
        WHERE tmdb_id = ?
        GROUP BY reaction
      `).bind(parseInt(c)).all(),p=l.reduce((w,y)=>w+y.cnt,0),u={};s.forEach(w=>u[w]=0),l.forEach(w=>{s.includes(w.reaction)&&(u[w.reaction]=w.cnt)});let g={},m=0,E=s.map(w=>({k:w,raw:u[w]/p*100}));return E.forEach((w,y)=>{y<E.length-1?(g[w.k]=Math.round(w.raw),m+=g[w.k]):g[w.k]=100-m}),new Response(JSON.stringify({ok:!0,data:{total:p,counts:u,ratios:g,my_reaction:d}}),{headers:e})}catch(o){return new Response(JSON.stringify({ok:!1,message:o.message}),{status:500,headers:e})}if(r.match(/^\/reactions\/\d+\/comments$/)&&i.method==="GET"){let o=parseInt(r.split("/")[2]),{results:n}=await t.DB.prepare("SELECT * FROM reaction_comments WHERE reaction_id = ? ORDER BY like_count DESC LIMIT 50").bind(o).all();return new Response(JSON.stringify({ok:!0,data:n}),{headers:e})}if(r.match(/^\/reactions\/\d+\/posts$/)&&i.method==="GET"){let o=parseInt(r.split("/")[2]),{results:n}=await t.DB.prepare("SELECT * FROM reaction_posts WHERE reaction_id = ? ORDER BY created_at DESC").bind(o).all();return new Response(JSON.stringify({ok:!0,data:n}),{headers:e})}if(r.match(/^\/reactions\/\d+\/posts$/)&&i.method==="POST")try{let o=parseInt(r.split("/")[2]),n=i.headers.get("Authorization")||"",_=n.startsWith("Bearer ")?n.slice(7).trim():null,c=L(i),d=_||c;if(!d)return new Response(JSON.stringify({ok:!1,message:"\uB85C\uADF8\uC778\uC774 \uD544\uC694\uD569\uB2C8\uB2E4."}),{status:401,headers:e});let s=await t.DB.prepare(`SELECT s.user_id AS id, u.nickname
         FROM sessions s
         JOIN users u ON u.id = s.user_id
         WHERE s.id = ?
         LIMIT 1`).bind(d).first();if(!s)return new Response(JSON.stringify({ok:!1,message:"\uB85C\uADF8\uC778\uC774 \uD544\uC694\uD569\uB2C8\uB2E4."}),{status:401,headers:e});let a=await i.json(),{is_spoiler:l,tmdb_id:p}=a,u=(a.content||"").trim();if(!u)return new Response(JSON.stringify({ok:!1,message:"\uB313\uAE00 \uB0B4\uC6A9\uC744 \uC785\uB825\uD574\uC8FC\uC138\uC694"}),{status:400,headers:e});if(u.length>500)return new Response(JSON.stringify({ok:!1,message:"\uB313\uAE00\uC740 500\uC790 \uC774\uB0B4\uB85C \uC785\uB825\uD574\uC8FC\uC138\uC694"}),{status:400,headers:e});let g=await t.DB.prepare(`
        INSERT INTO reaction_posts (reaction_id, tmdb_id, user_id, nickname, content, is_spoiler)
        VALUES (?, ?, ?, ?, ?, ?)
      `).bind(o,p||0,s.id,s.nickname,u,l?1:0).run();return new Response(JSON.stringify({ok:!0,id:g.meta?.last_row_id,nickname:s.nickname}),{headers:e})}catch(o){return new Response(JSON.stringify({ok:!1,message:o.message}),{status:500,headers:e})}if(r.match(/^\/reactions\/posts\/\d+$/)&&i.method==="DELETE")try{let o=parseInt(r.split("/")[3]),n=i.headers.get("Authorization")||"",_=n.startsWith("Bearer ")?n.slice(7).trim():null,c=L(i),d=_||c;if(!d)return new Response(JSON.stringify({ok:!1,message:"\uB85C\uADF8\uC778\uC774 \uD544\uC694\uD569\uB2C8\uB2E4."}),{status:401,headers:e});let s=await t.DB.prepare("SELECT s.user_id AS id FROM sessions s WHERE s.id = ? LIMIT 1").bind(d).first();if(!s)return new Response(JSON.stringify({ok:!1,message:"\uB85C\uADF8\uC778\uC774 \uD544\uC694\uD569\uB2C8\uB2E4."}),{status:401,headers:e});let a=await t.DB.prepare("SELECT id, user_id FROM reaction_posts WHERE id = ?").bind(o).first();return a?a.user_id!==s.id?new Response(JSON.stringify({ok:!1,message:"\uBCF8\uC778 \uB313\uAE00\uB9CC \uC0AD\uC81C\uD560 \uC218 \uC788\uC2B5\uB2C8\uB2E4."}),{status:403,headers:e}):(await t.DB.prepare("DELETE FROM reaction_posts WHERE id = ?").bind(o).run(),new Response(JSON.stringify({ok:!0}),{headers:e})):new Response(JSON.stringify({ok:!1,message:"\uB313\uAE00\uC744 \uCC3E\uC744 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4."}),{status:404,headers:e})}catch(o){return new Response(JSON.stringify({ok:!1,message:o.message}),{status:500,headers:e})}if(r.match(/^\/reactions\/posts\/\d+\/like$/)&&i.method==="POST")try{let o=parseInt(r.split("/")[3]);return await t.DB.prepare("UPDATE reaction_posts SET like_count = like_count + 1 WHERE id = ?").bind(o).run(),new Response(JSON.stringify({ok:!0}),{headers:e})}catch(o){return new Response(JSON.stringify({ok:!1,message:o.message}),{status:500,headers:e})}if(r==="/admin/reactions"&&i.method==="POST"){if(!N(i,t))return new Response(JSON.stringify({ok:!1,message:"Unauthorized"}),{status:401,headers:e});try{let o=await i.json(),{tmdb_id:n,title_ko:_,poster_path:c,video_id:d,video_title:s,channel_name:a,thumbnail:l,view_count:p,like_count:u,published_at:g,custom_title:m}=o;if(!n||!d)return new Response(JSON.stringify({ok:!1,message:"tmdb_id and video_id required"}),{status:400,headers:e});await t.DB.prepare(`
        INSERT OR REPLACE INTO reactions
          (tmdb_id, title_ko, poster_path, platform, video_id, video_title,
           custom_title, channel_name, thumbnail, view_count, like_count, published_at, is_manual)
        VALUES (?, ?, ?, 'youtube', ?, ?, ?, ?, ?, ?, ?, ?, 1)
      `).bind(parseInt(n),_||"",c||"",d,s||"",m||s||"",a||"",l||"",p||0,u||0,g||new Date().toISOString()).run();let w=(await t.DB.prepare("SELECT id FROM reactions WHERE video_id = ? LIMIT 1").bind(d).first())?.id;return w&&t.YOUTUBE_API_KEY&&t.ANTHROPIC_API_KEY&&f.waitUntil(K(w,d,parseInt(n),t)),new Response(JSON.stringify({ok:!0,reaction_id:w,collecting:!!(w&&t.YOUTUBE_API_KEY),message:t.YOUTUBE_API_KEY?"\uB4F1\uB85D \uC644\uB8CC! \uB313\uAE00 \uC218\uC9D1\xB7\uBC88\uC5ED \uC911 (\uC57D 30\uCD08 \uD6C4 \uD45C\uC2DC)":"\uB4F1\uB85D \uC644\uB8CC"}),{headers:e})}catch(o){return new Response(JSON.stringify({ok:!1,message:o.message}),{status:500,headers:e})}}if(r.match(/^\/admin\/reactions\/\d+\/collect$/)&&i.method==="POST"){if(!N(i,t))return new Response(JSON.stringify({ok:!1,message:"Unauthorized"}),{status:401,headers:e});try{let o=parseInt(r.split("/")[3]),n=await t.DB.prepare("SELECT id, video_id, tmdb_id FROM reactions WHERE id = ? LIMIT 1").bind(o).first();return n?t.YOUTUBE_API_KEY?(f.waitUntil(K(n.id,n.video_id,n.tmdb_id,t)),new Response(JSON.stringify({ok:!0,message:"\uB313\uAE00 \uC218\uC9D1\xB7\uBC88\uC5ED \uC2DC\uC791! \uC57D 30\uCD08 \uD6C4 \uD655\uC778\uD558\uC138\uC694"}),{headers:e})):new Response(JSON.stringify({ok:!1,message:"YOUTUBE_API_KEY not set"}),{status:500,headers:e}):new Response(JSON.stringify({ok:!1,message:"reaction not found"}),{status:404,headers:e})}catch(o){return new Response(JSON.stringify({ok:!1,message:o.message}),{status:500,headers:e})}}if(r.match(/^\/admin\/reactions\/\d+$/)&&i.method==="PATCH"){if(!N(i,t))return new Response(JSON.stringify({ok:!1,message:"Unauthorized"}),{status:401,headers:e});try{let o=parseInt(r.split("/")[3]),n=await i.json(),{custom_title:_,is_featured_off:c}=n;return c?await t.DB.prepare("UPDATE reactions SET is_featured = 0 WHERE id = ?").bind(o).run():await t.DB.prepare("UPDATE reactions SET custom_title = ? WHERE id = ?").bind(_||"",o).run(),new Response(JSON.stringify({ok:!0}),{headers:e})}catch(o){return new Response(JSON.stringify({ok:!1,message:o.message}),{status:500,headers:e})}}if(r.match(/^\/admin\/reactions\/\d+\/featured$/)&&i.method==="PUT"){if(!N(i,t))return new Response(JSON.stringify({ok:!1,message:"Unauthorized"}),{status:401,headers:e});try{let o=parseInt(r.split("/")[3]);return await t.DB.prepare("UPDATE reactions SET is_featured = 0").run(),await t.DB.prepare("UPDATE reactions SET is_featured = 1 WHERE id = ?").bind(o).run(),new Response(JSON.stringify({ok:!0}),{headers:e})}catch(o){return new Response(JSON.stringify({ok:!1,message:o.message}),{status:500,headers:e})}}if(r.match(/^\/admin\/reactions\/\d+$/)&&i.method==="DELETE"){if(!N(i,t))return new Response(JSON.stringify({ok:!1,message:"Unauthorized"}),{status:401,headers:e});try{let o=parseInt(r.split("/")[3]);return await t.DB.prepare("DELETE FROM reactions WHERE id = ?").bind(o).run(),await t.DB.prepare("DELETE FROM reaction_comments WHERE reaction_id = ?").bind(o).run(),await t.DB.prepare("DELETE FROM reaction_posts WHERE reaction_id = ?").bind(o).run(),new Response(JSON.stringify({ok:!0}),{headers:e})}catch(o){return new Response(JSON.stringify({ok:!1,message:o.message}),{status:500,headers:e})}}return null}var z=["\uADC0\uC5EC\uC6B4","\uC6A9\uAC10\uD55C","\uC2E0\uBE44\uB85C\uC6B4","\uC5C9\uB6B1\uD55C","\uC870\uC6A9\uD55C","\uD65C\uBC1C\uD55C","\uB290\uAE0B\uD55C","\uC5F4\uC815\uC801\uC778","\uB0AD\uB9CC\uC801\uC778","\uC9C4\uC9C0\uD55C","\uC720\uCF8C\uD55C","\uB2F9\uB2F9\uD55C","\uC218\uC90D\uC740","\uB3C5\uD2B9\uD55C","\uBE60\uB978","\uB530\uB73B\uD55C","\uCC28\uAC00\uC6B4","\uBC30\uACE0\uD508","\uC878\uB9B0","\uBA4B\uC9C4","\uD669\uB2F9\uD55C","\uC9C4\uC9C0\uD55C","\uB290\uB9B0","\uC601\uB9AC\uD55C","\uAC15\uD55C"];async function nt(r,i,t,f){let e=new URL(i.url);if(r==="/auth/google"&&i.method==="GET"){let o=e.searchParams.get("redirect")||"",n="https://accounts.google.com/o/oauth2/v2/auth?client_id="+t.GOOGLE_CLIENT_ID+"&redirect_uri="+encodeURIComponent("https://ottrank-api.tdidream.workers.dev/auth/google/callback")+"&response_type=code&scope="+encodeURIComponent("openid email profile")+"&access_type=offline"+(o?"&state="+encodeURIComponent(o):"");return Response.redirect(n,302)}if(r==="/auth/google/callback"&&i.method==="GET"){let o=e.searchParams.get("code");if(!o)return Response.redirect("https://ottrank.kr?login=fail",302);try{let _=await(await fetch("https://oauth2.googleapis.com/token",{method:"POST",headers:{"Content-Type":"application/x-www-form-urlencoded"},body:new URLSearchParams({grant_type:"authorization_code",client_id:t.GOOGLE_CLIENT_ID,client_secret:t.GOOGLE_CLIENT_SECRET,redirect_uri:"https://ottrank-api.tdidream.workers.dev/auth/google/callback",code:o})})).json();if(!_.access_token)return Response.redirect("https://ottrank.kr?login=fail",302);let d=await(await fetch("https://www.googleapis.com/oauth2/v2/userinfo",{headers:{Authorization:"Bearer "+_.access_token}})).json(),s=String(d.id),a=d.email||"",l=d.picture||"",p=await t.DB.prepare("SELECT id, nickname FROM users WHERE provider = 'google' AND provider_id = ?").bind(s).first();await t.DB.prepare(`
        INSERT INTO users (provider, provider_id, nickname, email, avatar_url, last_login)
        VALUES ('google', ?, null, ?, ?, datetime('now'))
        ON CONFLICT(provider, provider_id) DO UPDATE SET
          email      = excluded.email,
          avatar_url = excluded.avatar_url,
          last_login = datetime('now')
      `).bind(s,a,l).run();let u=await t.DB.prepare("SELECT id, nickname, last_login_bonus_date FROM users WHERE provider = 'google' AND provider_id = ?").bind(s).first(),g=!p||!p.nickname||p.nickname.trim()==="",m=crypto.randomUUID(),E=new Date(Date.now()+720*60*60*1e3).toISOString();await t.DB.prepare("INSERT INTO sessions (id, user_id, expires_at) VALUES (?, ?, ?)").bind(m,u.id,E).run();let w=e.searchParams.get("state")||"",y=w?decodeURIComponent(w):"";if(!g){let S=new Date(Date.now()+324e5).toISOString().slice(0,10);u.last_login_bonus_date!==S&&(await W(u.id,3,"login",t),await t.DB.prepare("UPDATE users SET last_login_bonus_date = ? WHERE id = ?").bind(S,u.id).run())}let k=g?`https://ottrank.kr/signup.html?sid=${m}`+(y?`&redirect=${encodeURIComponent(y)}`:""):`https://ottrank.kr/mypage.html?sid=${m}`;return new Response(null,{status:302,headers:{Location:k,"Set-Cookie":`session=${m}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${720*60*60}`}})}catch(n){return console.error("[AUTH] \uAD6C\uAE00 \uCF5C\uBC31 \uC624\uB958:",n.message),Response.redirect("https://ottrank.kr?login=fail",302)}}if(r==="/auth/naver"&&i.method==="GET"){let o=e.searchParams.get("redirect")||"",n=o?encodeURIComponent(o):crypto.randomUUID(),_="https://nid.naver.com/oauth2.0/authorize?client_id="+t.NAVER_CLIENT_ID+"&redirect_uri="+encodeURIComponent("https://ottrank-api.tdidream.workers.dev/auth/naver/callback")+"&response_type=code&state="+n;return Response.redirect(_,302)}if(r==="/auth/naver/callback"&&i.method==="GET"){let o=e.searchParams.get("code");if(!o)return Response.redirect("https://ottrank.kr?login=fail",302);try{let _=await(await fetch("https://nid.naver.com/oauth2.0/token",{method:"POST",headers:{"Content-Type":"application/x-www-form-urlencoded"},body:new URLSearchParams({grant_type:"authorization_code",client_id:t.NAVER_CLIENT_ID,client_secret:t.NAVER_CLIENT_SECRET,redirect_uri:"https://ottrank-api.tdidream.workers.dev/auth/naver/callback",code:o,state:e.searchParams.get("state")||""})})).json();if(!_.access_token)return Response.redirect("https://ottrank.kr?login=fail",302);let s=(await(await fetch("https://openapi.naver.com/v1/nid/me",{headers:{Authorization:"Bearer "+_.access_token}})).json()).response,a=String(s.id),l=s.email||"",p=s.profile_image||"",u=await t.DB.prepare("SELECT id, nickname FROM users WHERE provider = 'naver' AND provider_id = ?").bind(a).first();await t.DB.prepare(`
        INSERT INTO users (provider, provider_id, nickname, email, avatar_url, last_login)
        VALUES ('naver', ?, '', ?, ?, datetime('now'))
        ON CONFLICT(provider, provider_id) DO UPDATE SET
          email      = excluded.email,
          avatar_url = excluded.avatar_url,
          last_login = datetime('now')
      `).bind(a,l,p).run();let g=await t.DB.prepare("SELECT id, nickname, last_login_bonus_date FROM users WHERE provider = 'naver' AND provider_id = ?").bind(a).first(),m=!u||!u.nickname||u.nickname.trim()==="",E=crypto.randomUUID(),w=new Date(Date.now()+720*60*60*1e3).toISOString();await t.DB.prepare("INSERT INTO sessions (id, user_id, expires_at) VALUES (?, ?, ?)").bind(E,g.id,w).run();let y=e.searchParams.get("state")||"",k="";try{k=y?decodeURIComponent(y):""}catch{}if(k.startsWith("/")||(k=""),!m){let R=new Date(Date.now()+324e5).toISOString().slice(0,10);g.last_login_bonus_date!==R&&(await W(g.id,3,"login",t),await t.DB.prepare("UPDATE users SET last_login_bonus_date = ? WHERE id = ?").bind(R,g.id).run())}let S=m?`https://ottrank.kr/signup.html?sid=${E}`+(k?`&redirect=${encodeURIComponent(k)}`:""):`https://ottrank.kr/mypage.html?sid=${E}`;return new Response(null,{status:302,headers:{Location:S,"Set-Cookie":`session=${E}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${720*60*60}`}})}catch(n){return console.error("[AUTH] \uB124\uC774\uBC84 \uCF5C\uBC31 \uC624\uB958:",n.message),Response.redirect("https://ottrank.kr?login=fail",302)}}if(r==="/auth/kakao"&&i.method==="GET"){let o=e.searchParams.get("redirect")||"",n=o?encodeURIComponent(o):"",_="https://kauth.kakao.com/oauth/authorize?client_id="+t.KAKAO_CLIENT_ID+"&redirect_uri="+encodeURIComponent("https://ottrank-api.tdidream.workers.dev/auth/kakao/callback")+"&response_type=code"+(n?"&state="+n:"");return Response.redirect(_,302)}if(r==="/auth/kakao/callback"&&i.method==="GET"){let o=e.searchParams.get("code");if(!o)return Response.redirect("https://ottrank.kr?login=fail",302);try{let _=await(await fetch("https://kauth.kakao.com/oauth/token",{method:"POST",headers:{"Content-Type":"application/x-www-form-urlencoded"},body:new URLSearchParams({grant_type:"authorization_code",client_id:t.KAKAO_CLIENT_ID,client_secret:t.KAKAO_CLIENT_SECRET,redirect_uri:"https://ottrank-api.tdidream.workers.dev/auth/kakao/callback",code:o})})).json();if(!_.access_token)return Response.redirect("https://ottrank.kr?login=fail",302);let d=await(await fetch("https://kapi.kakao.com/v2/user/me",{headers:{Authorization:"Bearer "+_.access_token}})).json(),s=String(d.id),a=d.kakao_account?.profile?.profile_image_url||"",l=d.kakao_account?.email||"",p=await t.DB.prepare("SELECT id, nickname FROM users WHERE provider = 'kakao' AND provider_id = ?").bind(s).first();await t.DB.prepare(`
        INSERT INTO users (provider, provider_id, nickname, email, avatar_url, last_login)
        VALUES ('kakao', ?, '', ?, ?, datetime('now'))
        ON CONFLICT(provider, provider_id) DO UPDATE SET
          email      = excluded.email,
          avatar_url = excluded.avatar_url,
          last_login = datetime('now')
      `).bind(s,l,a).run();let u=await t.DB.prepare("SELECT id, nickname, last_login_bonus_date FROM users WHERE provider = 'kakao' AND provider_id = ?").bind(s).first(),g=!p||!p.nickname||p.nickname.trim()==="",m=crypto.randomUUID(),E=new Date(Date.now()+720*60*60*1e3).toISOString();await t.DB.prepare("INSERT INTO sessions (id, user_id, expires_at) VALUES (?, ?, ?)").bind(m,u.id,E).run();let w=e.searchParams.get("state")||"",y=w?decodeURIComponent(w):"";if(!g){let S=new Date(Date.now()+324e5).toISOString().slice(0,10);u.last_login_bonus_date!==S&&(await W(u.id,3,"login",t),await t.DB.prepare("UPDATE users SET last_login_bonus_date = ? WHERE id = ?").bind(S,u.id).run())}let k=g?`https://ottrank.kr/signup.html?sid=${m}`+(y?`&redirect=${encodeURIComponent(y)}`:""):`https://ottrank.kr/mypage.html?sid=${m}`;return new Response(null,{status:302,headers:{Location:k,"Set-Cookie":`session=${m}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${720*60*60}`}})}catch(n){return console.error("[AUTH] \uCE74\uCE74\uC624 \uCF5C\uBC31 \uC624\uB958:",n.message),Response.redirect("https://ottrank.kr?login=fail",302)}}if(r==="/auth/me"&&i.method==="GET")try{let _=(i.headers.get("Authorization")||"").replace("Bearer ","").trim()||L(i);if(!_)return new Response(JSON.stringify({ok:!1}),{headers:f});let c=await t.DB.prepare("SELECT * FROM sessions WHERE id = ? AND expires_at > datetime('now')").bind(_).first();if(!c)return new Response(JSON.stringify({ok:!1}),{headers:f});let d=await t.DB.prepare("SELECT id, nickname, email, avatar_url, provider, grade, total_likes_received, mbti, ott_points, created_at, last_login_bonus_date FROM users WHERE id = ?").bind(c.user_id).first();if(!d)return new Response(JSON.stringify({ok:!1}),{headers:f});let s=new Date(Date.now()+540*60*1e3).toISOString().slice(0,10);d.last_login_bonus_date!==s&&(await W(d.id,3,"login",t),await t.DB.prepare("UPDATE users SET last_login_bonus_date = ? WHERE id = ?").bind(s,d.id).run(),d.ott_points=(d.ott_points||0)+3,d.last_login_bonus_date=s);let a=await t.DB.prepare("SELECT grade_name, grade_key, emoji_url, sort_order FROM grade_settings WHERE grade_key = ?").bind(d.grade||"rookie").first();return new Response(JSON.stringify({ok:!0,user:{...d,gradeInfo:a||null}}),{headers:f})}catch{return new Response(JSON.stringify({ok:!1}),{headers:f})}if(r==="/auth/random-nickname"&&i.method==="GET")try{let n=(await t.DB.prepare(`
        SELECT title_ko FROM works
        WHERE title_ko IS NOT NULL
          AND title_ko != ''
          AND length(title_ko) <= 10
        ORDER BY RANDOM()
        LIMIT 1
      `).first())?.title_ko||"\uB4DC\uB77C\uB9C8\uD32C",_=z[Math.floor(Math.random()*z.length)],c=Math.floor(Math.random()*9e3)+1e3,d=`${_}${n}${c}`;return d.length>20&&(d=`${_}${n.slice(0,6)}${c}`),new Response(JSON.stringify({ok:!0,nickname:d}),{headers:f})}catch{let n=z[Math.floor(Math.random()*z.length)],_=Math.floor(Math.random()*9e3)+1e3;return new Response(JSON.stringify({ok:!0,nickname:`${n}\uC2DC\uB124\uB9C8${_}`}),{headers:f})}if(r==="/auth/nickname"&&i.method==="POST")try{let o=await i.json(),{nickname:n,sid:_,mbti:c}=o,d=_||L(i);if(!d)return new Response(JSON.stringify({ok:!1,message:"\uB85C\uADF8\uC778\uC774 \uD544\uC694\uD574\uC694"}),{status:401,headers:f});let s=await t.DB.prepare("SELECT * FROM sessions WHERE id = ? AND expires_at > datetime('now')").bind(d).first();if(!s)return new Response(JSON.stringify({ok:!1,message:"\uC138\uC158\uC774 \uB9CC\uB8CC\uB410\uC5B4\uC694"}),{status:401,headers:f});if(!n||n.trim().length<2)return new Response(JSON.stringify({ok:!1,message:"\uB2C9\uB124\uC784\uC740 2\uC790 \uC774\uC0C1 \uC785\uB825\uD574\uC8FC\uC138\uC694"}),{status:400,headers:f});if(n.trim().length>20)return new Response(JSON.stringify({ok:!1,message:"\uB2C9\uB124\uC784\uC740 20\uC790 \uC774\uB0B4\uB85C \uC785\uB825\uD574\uC8FC\uC138\uC694"}),{status:400,headers:f});if(!/^[가-힣a-zA-Z0-9]+$/.test(n.trim()))return new Response(JSON.stringify({ok:!1,message:"\uD55C\uAE00, \uC601\uBB38, \uC22B\uC790\uB9CC \uC0AC\uC6A9\uD560 \uC218 \uC788\uC5B4\uC694"}),{status:400,headers:f});if(await t.DB.prepare("SELECT id FROM users WHERE nickname = ? AND id != ?").bind(n.trim(),s.user_id).first())return new Response(JSON.stringify({ok:!1,message:"\uC774\uBBF8 \uC0AC\uC6A9 \uC911\uC778 \uB2C9\uB124\uC784\uC774\uC5D0\uC694"}),{status:400,headers:f});let p=c&&["INTJ","INTP","ENTJ","ENTP","INFJ","INFP","ENFJ","ENFP","ISTJ","ISFJ","ESTJ","ESFJ","ISTP","ISFP","ESTP","ESFP"].includes(c)?c:null;return await t.DB.prepare("UPDATE users SET nickname = ?, mbti = ? WHERE id = ?").bind(n.trim(),p,s.user_id).run(),await t.DB.prepare("SELECT id FROM user_point_logs WHERE user_id = ? AND reason = 'signup' LIMIT 1").bind(s.user_id).first()||await W(s.user_id,30,"signup",t),p&&(await t.DB.prepare("SELECT id FROM user_point_logs WHERE user_id = ? AND reason = 'mbti_register' LIMIT 1").bind(s.user_id).first()||await W(s.user_id,20,"mbti_register",t)),new Response(JSON.stringify({ok:!0}),{headers:f})}catch(o){return new Response(JSON.stringify({ok:!1,message:o.message}),{status:500,headers:f})}if(r==="/auth/nickname"&&i.method==="PUT")try{let n=(i.headers.get("Authorization")||"").replace("Bearer ","").trim()||L(i);if(!n)return new Response(JSON.stringify({ok:!1,message:"\uB85C\uADF8\uC778 \uD544\uC694"}),{status:401,headers:f});let _=await t.DB.prepare("SELECT * FROM sessions WHERE id = ? AND expires_at > datetime('now')").bind(n).first();if(!_)return new Response(JSON.stringify({ok:!1,message:"\uC138\uC158 \uB9CC\uB8CC"}),{status:401,headers:f});let c=await i.json(),{nickname:d}=c;return!d||d.trim().length<2?new Response(JSON.stringify({ok:!1,message:"\uB2C9\uB124\uC784\uC740 2\uC790 \uC774\uC0C1 \uC785\uB825\uD574\uC8FC\uC138\uC694"}),{status:400,headers:f}):d.trim().length>20?new Response(JSON.stringify({ok:!1,message:"\uB2C9\uB124\uC784\uC740 20\uC790 \uC774\uB0B4\uB85C \uC785\uB825\uD574\uC8FC\uC138\uC694"}),{status:400,headers:f}):/^[가-힣a-zA-Z0-9]+$/.test(d.trim())?await t.DB.prepare("SELECT id FROM users WHERE nickname = ? AND id != ?").bind(d.trim(),_.user_id).first()?new Response(JSON.stringify({ok:!1,message:"\uC774\uBBF8 \uC0AC\uC6A9 \uC911\uC778 \uB2C9\uB124\uC784\uC774\uC5D0\uC694"}),{status:400,headers:f}):(await t.DB.prepare("UPDATE users SET nickname = ? WHERE id = ?").bind(d.trim(),_.user_id).run(),new Response(JSON.stringify({ok:!0}),{headers:f})):new Response(JSON.stringify({ok:!1,message:"\uD55C\uAE00, \uC601\uBB38, \uC22B\uC790\uB9CC \uC0AC\uC6A9\uD560 \uC218 \uC788\uC5B4\uC694"}),{status:400,headers:f})}catch(o){return new Response(JSON.stringify({ok:!1,message:o.message}),{status:500,headers:f})}if(r==="/auth/withdraw"&&i.method==="DELETE")try{let n=(i.headers.get("Authorization")||"").replace("Bearer ","").trim()||L(i);if(!n)return new Response(JSON.stringify({ok:!1,message:"\uB85C\uADF8\uC778 \uD544\uC694"}),{status:401,headers:f});let _=await t.DB.prepare("SELECT user_id FROM sessions WHERE id = ? AND expires_at > datetime('now')").bind(n).first();if(!_)return new Response(JSON.stringify({ok:!1,message:"\uC138\uC158 \uB9CC\uB8CC"}),{status:401,headers:f});let c=_.user_id;return await t.DB.prepare("DELETE FROM sessions  WHERE user_id = ?").bind(c).run(),await t.DB.prepare("DELETE FROM wishlist  WHERE user_id = ?").bind(c).run(),await t.DB.prepare("DELETE FROM reviews   WHERE user_id = ?").bind(c).run(),await t.DB.prepare("DELETE FROM posts     WHERE user_id = ?").bind(c).run(),await t.DB.prepare("DELETE FROM users     WHERE id = ?").bind(c).run(),new Response(JSON.stringify({ok:!0}),{headers:{...f,"Set-Cookie":"session=; Path=/; HttpOnly; Secure; Max-Age=0"}})}catch(o){return new Response(JSON.stringify({ok:!1,message:o.message}),{status:500,headers:f})}if(r==="/auth/mbti"&&i.method==="PATCH")try{let n=(i.headers.get("Authorization")||"").replace("Bearer ","").trim()||L(i);if(!n)return new Response(JSON.stringify({ok:!1,message:"\uB85C\uADF8\uC778 \uD544\uC694"}),{status:401,headers:f});let _=await t.DB.prepare("SELECT * FROM sessions WHERE id = ? AND expires_at > datetime('now')").bind(n).first();if(!_)return new Response(JSON.stringify({ok:!1,message:"\uC138\uC158 \uB9CC\uB8CC"}),{status:401,headers:f});let c=await i.json(),{mbti:d}=c,a=d&&["INTJ","INTP","ENTJ","ENTP","INFJ","INFP","ENFJ","ENFP","ISTJ","ISFJ","ESTJ","ESFJ","ISTP","ISFP","ESTP","ESFP"].includes(d)?d:null,l=await t.DB.prepare("SELECT mbti FROM users WHERE id = ?").bind(_.user_id).first();await t.DB.prepare("UPDATE users SET mbti = ? WHERE id = ?").bind(a,_.user_id).run();let p=!!l?.mbti,u=!!a;return!p&&u?await t.DB.prepare("SELECT id FROM user_point_logs WHERE user_id = ? AND reason = 'mbti_register' LIMIT 1").bind(_.user_id).first()||await W(_.user_id,20,"mbti_register",t):p&&!u&&await W(_.user_id,-20,"mbti_unregister",t),new Response(JSON.stringify({ok:!0,mbti:a}),{headers:f})}catch(o){return new Response(JSON.stringify({ok:!1,message:o.message}),{status:500,headers:f})}if(r==="/auth/logout"&&i.method==="POST")try{let _=(i.headers.get("Authorization")||"").replace("Bearer ","").trim()||L(i);return _&&await t.DB.prepare("DELETE FROM sessions WHERE id = ?").bind(_).run(),new Response(JSON.stringify({ok:!0}),{headers:{...f,"Set-Cookie":"session=; Path=/; HttpOnly; Secure; Max-Age=0"}})}catch(o){return new Response(JSON.stringify({ok:!1,message:o.message}),{status:500,headers:f})}return null}async function ot(r,i,t,f,e){if(r==="/wishlist"&&i.method==="GET")try{let _=(i.headers.get("Authorization")||"").replace("Bearer ","").trim()||L(i);if(!_)return new Response(JSON.stringify({ok:!1,message:"\uB85C\uADF8\uC778 \uD544\uC694"}),{status:401,headers:e});let c=await t.DB.prepare("SELECT user_id FROM sessions WHERE id = ? AND expires_at > datetime('now')").bind(_).first();if(!c)return new Response(JSON.stringify({ok:!1}),{status:401,headers:e});let{results:d}=await t.DB.prepare("SELECT * FROM wishlist WHERE user_id = ? ORDER BY created_at DESC").bind(c.user_id).all();return new Response(JSON.stringify({ok:!0,data:d}),{headers:e})}catch(n){return new Response(JSON.stringify({ok:!1,message:n.message}),{status:500,headers:e})}if(r==="/wishlist"&&i.method==="POST")try{let _=(i.headers.get("Authorization")||"").replace("Bearer ","").trim()||L(i);if(!_)return new Response(JSON.stringify({ok:!1,message:"\uB85C\uADF8\uC778 \uD544\uC694"}),{status:401,headers:e});let c=await t.DB.prepare("SELECT user_id FROM sessions WHERE id = ? AND expires_at > datetime('now')").bind(_).first();if(!c)return new Response(JSON.stringify({ok:!1,message:"\uC138\uC158 \uB9CC\uB8CC"}),{status:401,headers:e});let d=await i.json(),{tmdb_id:s,title_ko:a,poster_path:l,release_year:p,category:u}=d;return s?await t.DB.prepare("SELECT id FROM wishlist WHERE user_id = ? AND tmdb_id = ?").bind(c.user_id,parseInt(s)).first()?(await t.DB.prepare("DELETE FROM wishlist WHERE user_id = ? AND tmdb_id = ?").bind(c.user_id,parseInt(s)).run(),f.waitUntil(U(c.user_id,t)),new Response(JSON.stringify({ok:!0,wishlisted:!1}),{headers:e})):(await t.DB.prepare("INSERT INTO wishlist (user_id, tmdb_id, title_ko, poster_path, release_year, category) VALUES (?, ?, ?, ?, ?, ?)").bind(c.user_id,parseInt(s),a||"",l||"",p||"",u||"movie").run(),f.waitUntil(W(c.user_id,1,"wishlist",t)),f.waitUntil(U(c.user_id,t)),new Response(JSON.stringify({ok:!0,wishlisted:!0}),{headers:e})):new Response(JSON.stringify({ok:!1,message:"tmdb_id \uD544\uC694"}),{status:400,headers:e})}catch(n){return new Response(JSON.stringify({ok:!1,message:n.message}),{status:500,headers:e})}if(r.match(/^\/wishlist\/check\/\d+$/)&&i.method==="GET")try{let n=parseInt(r.split("/")[3]),c=(i.headers.get("Authorization")||"").replace("Bearer ","").trim()||L(i);if(!c)return new Response(JSON.stringify({ok:!0,wishlisted:!1}),{headers:e});let d=await t.DB.prepare("SELECT user_id FROM sessions WHERE id = ? AND expires_at > datetime('now')").bind(c).first();if(!d)return new Response(JSON.stringify({ok:!0,wishlisted:!1}),{headers:e});let s=await t.DB.prepare("SELECT id FROM wishlist WHERE user_id = ? AND tmdb_id = ?").bind(d.user_id,n).first();return new Response(JSON.stringify({ok:!0,wishlisted:!!s}),{headers:e})}catch{return new Response(JSON.stringify({ok:!0,wishlisted:!1}),{headers:e})}if(r.match(/^\/reviews\/\d+$/)&&i.method==="GET")try{let n=parseInt(r.split("/")[2]),c=(i.headers.get("Authorization")||"").replace("Bearer ","").trim()||L(i),d=-1;if(c){let a=await t.DB.prepare("SELECT user_id FROM sessions WHERE id = ? AND expires_at > datetime('now')").bind(c).first();a&&(d=a.user_id)}let{results:s}=await t.DB.prepare(`
        SELECT r.*, u.nickname, u.provider, u.grade, u.mbti,
          gs.emoji_url as grade_emoji_url, gs.grade_name,
          CASE WHEN rl.id IS NOT NULL THEN 1 ELSE 0 END AS liked_by_me
        FROM reviews r
        JOIN users u ON r.user_id = u.id
        LEFT JOIN grade_settings gs ON gs.grade_key = u.grade
        LEFT JOIN review_likes rl ON rl.review_id = r.id AND rl.user_id = ? AND rl.is_active = 1
        WHERE r.tmdb_id = ?
        ORDER BY r.likes DESC, r.created_at DESC
      `).bind(d,n).all();return new Response(JSON.stringify({ok:!0,data:s}),{headers:e})}catch(n){return new Response(JSON.stringify({ok:!1,message:n.message}),{status:500,headers:e})}if(r.match(/^\/reviews\/\d+\/me$/)&&i.method==="GET")try{let n=parseInt(r.split("/")[2]),c=(i.headers.get("Authorization")||"").replace("Bearer ","").trim()||L(i);if(!c)return new Response(JSON.stringify({ok:!0,data:null}),{headers:e});let d=await t.DB.prepare("SELECT user_id FROM sessions WHERE id = ? AND expires_at > datetime('now')").bind(c).first();if(!d)return new Response(JSON.stringify({ok:!0,data:null}),{headers:e});let s=await t.DB.prepare("SELECT * FROM reviews WHERE tmdb_id = ? AND user_id = ?").bind(n,d.user_id).first();return new Response(JSON.stringify({ok:!0,data:s||null}),{headers:e})}catch(n){return new Response(JSON.stringify({ok:!1,message:n.message}),{status:500,headers:e})}if(r.match(/^\/reviews\/\d+$/)&&i.method==="POST")try{let n=parseInt(r.split("/")[2]),c=(i.headers.get("Authorization")||"").replace("Bearer ","").trim()||L(i);if(!c)return new Response(JSON.stringify({ok:!1,message:"\uB85C\uADF8\uC778 \uD544\uC694"}),{status:401,headers:e});let d=await t.DB.prepare("SELECT user_id FROM sessions WHERE id = ? AND expires_at > datetime('now')").bind(c).first();if(!d)return new Response(JSON.stringify({ok:!1,message:"\uC138\uC158 \uB9CC\uB8CC"}),{status:401,headers:e});let s=await i.json(),{score:a,emotions:l,custom_tags:p,text:u,spoiler:g}=s;if(!a||a<.5||a>10)return new Response(JSON.stringify({ok:!1,message:"\uBCC4\uC810\uC744 \uC120\uD0DD\uD574\uC8FC\uC138\uC694 (0.5~10)"}),{status:400,headers:e});let E=!await t.DB.prepare("SELECT id FROM reviews WHERE tmdb_id = ? AND user_id = ?").bind(n,d.user_id).first();return await t.DB.prepare(`
        INSERT INTO reviews (tmdb_id, user_id, score, emotions, custom_tags, text, spoiler)
        VALUES (?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(tmdb_id, user_id) DO UPDATE SET
          score       = excluded.score,
          emotions    = excluded.emotions,
          custom_tags = excluded.custom_tags,
          text        = excluded.text,
          spoiler     = excluded.spoiler,
          created_at  = datetime('now')
      `).bind(n,d.user_id,a,JSON.stringify(l||[]),JSON.stringify(p||[]),(u||"").slice(0,500),g?1:0).run(),E&&f.waitUntil(W(d.user_id,10,"review",t)),f.waitUntil(U(d.user_id,t)),new Response(JSON.stringify({ok:!0}),{headers:e})}catch(n){return new Response(JSON.stringify({ok:!1,message:n.message}),{status:500,headers:e})}if(r.match(/^\/reviews\/\d+\/like\/\d+$/)&&i.method==="POST")try{let n=parseInt(r.split("/")[4]),c=(i.headers.get("Authorization")||"").replace("Bearer ","").trim()||L(i);if(!c)return new Response(JSON.stringify({ok:!1,message:"\uB85C\uADF8\uC778 \uD544\uC694"}),{status:401,headers:e});let d=await t.DB.prepare("SELECT user_id FROM sessions WHERE id = ? AND expires_at > datetime('now')").bind(c).first();if(!d)return new Response(JSON.stringify({ok:!1,message:"\uC138\uC158 \uB9CC\uB8CC"}),{status:401,headers:e});let s=await t.DB.prepare("SELECT user_id FROM reviews WHERE id = ?").bind(n).first();if(!s)return new Response(JSON.stringify({ok:!1,message:"\uB9AC\uBDF0\uB97C \uCC3E\uC744 \uC218 \uC5C6\uC5B4\uC694"}),{status:404,headers:e});let a=await t.DB.prepare("SELECT id, is_active FROM review_likes WHERE review_id = ? AND user_id = ?").bind(n,d.user_id).first(),l;a?a.is_active?(await t.DB.prepare("UPDATE review_likes SET is_active = 0 WHERE id = ?").bind(a.id).run(),await t.DB.prepare("UPDATE reviews SET likes = MAX(0, likes - 1) WHERE id = ?").bind(n).run(),s.user_id&&await t.DB.prepare("UPDATE users SET total_likes_received = MAX(0, total_likes_received - 1) WHERE id = ?").bind(s.user_id).run(),l=!1):(await t.DB.prepare("UPDATE review_likes SET is_active = 1 WHERE id = ?").bind(a.id).run(),await t.DB.prepare("UPDATE reviews SET likes = likes + 1 WHERE id = ?").bind(n).run(),s.user_id&&await t.DB.prepare("UPDATE users SET total_likes_received = total_likes_received + 1 WHERE id = ?").bind(s.user_id).run(),l=!0):(await t.DB.prepare("INSERT INTO review_likes (review_id, user_id, is_active) VALUES (?, ?, 1)").bind(n,d.user_id).run(),await t.DB.prepare("UPDATE reviews SET likes = likes + 1 WHERE id = ?").bind(n).run(),s.user_id&&(await t.DB.prepare("UPDATE users SET total_likes_received = total_likes_received + 1 WHERE id = ?").bind(s.user_id).run(),f.waitUntil(W(s.user_id,1,"like_received",t)),f.waitUntil(U(s.user_id,t))),l=!0);let p=await t.DB.prepare("SELECT likes FROM reviews WHERE id = ?").bind(n).first();return new Response(JSON.stringify({ok:!0,liked:l,likes:p?.likes??0}),{headers:e})}catch(n){return new Response(JSON.stringify({ok:!1,message:n.message}),{status:500,headers:e})}if(r.match(/^\/reviews\/\d+$/)&&i.method==="DELETE")try{let n=parseInt(r.split("/")[2]),c=(i.headers.get("Authorization")||"").replace("Bearer ","").trim()||L(i);if(!c)return new Response(JSON.stringify({ok:!1,message:"\uB85C\uADF8\uC778 \uD544\uC694"}),{status:401,headers:e});let d=await t.DB.prepare("SELECT user_id FROM sessions WHERE id = ? AND expires_at > datetime('now')").bind(c).first();return d?(await t.DB.prepare("DELETE FROM reviews WHERE tmdb_id = ? AND user_id = ?").bind(n,d.user_id).run(),f.waitUntil(U(d.user_id,t)),new Response(JSON.stringify({ok:!0}),{headers:e})):new Response(JSON.stringify({ok:!1,message:"\uC138\uC158 \uB9CC\uB8CC"}),{status:401,headers:e})}catch(n){return new Response(JSON.stringify({ok:!1,message:n.message}),{status:500,headers:e})}if(r==="/mypage"&&i.method==="GET")try{let _=(i.headers.get("Authorization")||"").replace("Bearer ","").trim()||L(i);if(!_)return new Response(JSON.stringify({ok:!1,message:"\uB85C\uADF8\uC778 \uD544\uC694"}),{status:401,headers:e});let c=await t.DB.prepare("SELECT user_id FROM sessions WHERE id = ? AND expires_at > datetime('now')").bind(_).first();if(!c)return new Response(JSON.stringify({ok:!1,message:"\uC138\uC158 \uB9CC\uB8CC"}),{status:401,headers:e});let d=c.user_id,[s,a,l,p,u,g,m,E]=await t.DB.batch([t.DB.prepare(`
          SELECT u.id, u.nickname, u.provider, u.email, u.avatar_url,
            u.grade, u.total_likes_received, u.created_at, u.wishlist_public, u.mbti,
            u.ott_points,
            gs.grade_name, gs.emoji_url as grade_emoji_url, gs.sort_order as grade_order,
            gs.is_special as grade_is_special
          FROM users u
          LEFT JOIN grade_settings gs ON gs.grade_key = u.grade
          WHERE u.id = ?
        `).bind(d),t.DB.prepare(`
          SELECT r.id, r.tmdb_id, r.score, r.text, r.emotions, r.custom_tags,
            r.likes, r.spoiler, r.created_at,
            COALESCE(rk.title_ko,  wk.title_ko)    as title_ko,
            COALESCE(rk.poster_path, wk.poster_path) as poster_path,
            COALESCE(rk.category,  wk.media_type)  as category,
            rk.release_year
          FROM reviews r
          LEFT JOIN (
            SELECT tmdb_id, title_ko, poster_path, category, release_year
            FROM rankings
            WHERE tmdb_id IN (SELECT tmdb_id FROM reviews WHERE user_id = ?)
            GROUP BY tmdb_id
          ) rk ON rk.tmdb_id = r.tmdb_id
          LEFT JOIN works wk ON wk.tmdb_id = r.tmdb_id
          WHERE r.user_id = ?
          ORDER BY r.created_at DESC
        `).bind(d,d),t.DB.prepare(`
          SELECT w.*,
            COALESCE(rk.title_ko, w.title_ko) as title_ko,
            COALESCE(rk.poster_path, w.poster_path) as poster_path,
            COALESCE(rk.category, w.category, 'movie') as category,
            rk.release_year
          FROM wishlist w
          LEFT JOIN (
            SELECT tmdb_id, title_ko, poster_path, category, release_year
            FROM rankings
            WHERE tmdb_id IN (SELECT tmdb_id FROM wishlist WHERE user_id = ?)
            GROUP BY tmdb_id
          ) rk ON rk.tmdb_id = w.tmdb_id
          WHERE w.user_id = ?
          ORDER BY w.created_at DESC
        `).bind(d,d),t.DB.prepare(`
          SELECT id, board_type, title, like_count, view_count, created_at
          FROM posts
          WHERE user_id = ? AND is_hidden = 0
          ORDER BY created_at DESC
        `).bind(d),t.DB.prepare(`
          SELECT lw.*,
            COALESCE(wk.poster_path, lw.poster_path) as poster_path,
            COALESCE(wk.title_ko, lw.title_ko) as title_ko
          FROM life_works lw
          LEFT JOIN works wk ON wk.tmdb_id = lw.tmdb_id
          WHERE lw.user_id = ?
          ORDER BY lw.created_at DESC
        `).bind(d),t.DB.prepare("SELECT * FROM pick_lists WHERE user_id = ? ORDER BY created_at DESC").bind(d),t.DB.prepare(`
          SELECT points, reason, created_at
          FROM user_point_logs
          WHERE user_id = ?
          ORDER BY created_at DESC
          LIMIT 20
        `).bind(d),t.DB.prepare("SELECT grade_key, grade_name, min_ott_points, emoji_url, is_special, sort_order FROM grade_settings ORDER BY sort_order ASC")]),w=s.results[0]||null,y=a.results,k=l.results,S=p.results,R=u.results,b=g.results,T=m.results,D=E.results,O=[];if(b.length){let h=await t.DB.batch(b.map(C=>t.DB.prepare("SELECT * FROM pick_list_works WHERE pick_list_id = ? ORDER BY sort_order ASC, created_at DESC").bind(C.id)));O=b.map((C,I)=>{let J=h[I].results;return{...C,works:J,work_count:J.length}})}return new Response(JSON.stringify({ok:!0,is_own:!0,user:w,reviews:y,wishlist:k,posts:S,life_works:R,pick_lists:O,recent_point_logs:T,grade_settings:D,stats:{review_count:y.length,wishlist_count:k.length,likes_received:w?.total_likes_received||0,post_count:S.length,life_work_count:R.length,pick_list_count:O.length}}),{headers:e})}catch(n){return new Response(JSON.stringify({ok:!1,message:n.message}),{status:500,headers:e})}if(r==="/mypage/summary"&&i.method==="GET")try{let _=(i.headers.get("Authorization")||"").replace("Bearer ","").trim()||L(i);if(!_)return new Response(JSON.stringify({ok:!1,message:"\uB85C\uADF8\uC778 \uD544\uC694"}),{status:401,headers:e});let c=await t.DB.prepare("SELECT user_id FROM sessions WHERE id = ? AND expires_at > datetime('now')").bind(_).first();if(!c)return new Response(JSON.stringify({ok:!1,message:"\uC138\uC158 \uB9CC\uB8CC"}),{status:401,headers:e});let d=await t.DB.prepare(`
        SELECT u.id, u.nickname, u.grade, u.ott_points,
          gs.grade_name, gs.emoji_url as grade_emoji_url, gs.sort_order as grade_order,
          gs.is_special as grade_is_special
        FROM users u
        LEFT JOIN grade_settings gs ON gs.grade_key = u.grade
        WHERE u.id = ?
      `).bind(c.user_id).first();return new Response(JSON.stringify({ok:!0,user:d}),{headers:e})}catch(n){return new Response(JSON.stringify({ok:!1,message:n.message}),{status:500,headers:e})}if(r==="/mypage/point-logs"&&i.method==="GET")try{let _=(i.headers.get("Authorization")||"").replace("Bearer ","").trim()||L(i);if(!_)return new Response(JSON.stringify({ok:!1,message:"\uB85C\uADF8\uC778 \uD544\uC694"}),{status:401,headers:e});let c=await t.DB.prepare("SELECT user_id FROM sessions WHERE id = ? AND expires_at > datetime('now')").bind(_).first();if(!c)return new Response(JSON.stringify({ok:!1,message:"\uC138\uC158 \uB9CC\uB8CC"}),{status:401,headers:e});let d=new URL(i.url).searchParams,s=Math.max(1,parseInt(d.get("page")||"1")),a=Math.min(50,Math.max(1,parseInt(d.get("limit")||"10"))),l=(s-1)*a,[p,u]=await t.DB.batch([t.DB.prepare("SELECT COUNT(*) AS total FROM user_point_logs WHERE user_id = ?").bind(c.user_id),t.DB.prepare(`
          SELECT points, reason, created_at
          FROM user_point_logs
          WHERE user_id = ?
          ORDER BY created_at DESC
          LIMIT ? OFFSET ?
        `).bind(c.user_id,a,l)]),g=p.results[0]?.total||0,m=u.results;return new Response(JSON.stringify({ok:!0,logs:m,total:g,page:s,limit:a}),{headers:e})}catch(n){return new Response(JSON.stringify({ok:!1,message:n.message}),{status:500,headers:e})}if(r==="/mypage/wishlist-public"&&i.method==="PATCH")try{let _=(i.headers.get("Authorization")||"").replace("Bearer ","").trim()||L(i);if(!_)return new Response(JSON.stringify({ok:!1,message:"\uB85C\uADF8\uC778 \uD544\uC694"}),{status:401,headers:e});let c=await t.DB.prepare("SELECT user_id FROM sessions WHERE id = ? AND expires_at > datetime('now')").bind(_).first();if(!c)return new Response(JSON.stringify({ok:!1,message:"\uC138\uC158 \uB9CC\uB8CC"}),{status:401,headers:e});let s=(await i.json()).wishlist_public?1:0;return await t.DB.prepare("UPDATE users SET wishlist_public = ? WHERE id = ?").bind(s,c.user_id).run(),new Response(JSON.stringify({ok:!0,wishlist_public:s}),{headers:e})}catch(n){return new Response(JSON.stringify({ok:!1,message:n.message}),{status:500,headers:e})}if(r.match(/^\/user\/\d+$/)&&i.method==="GET")try{let n=parseInt(r.split("/")[2]),_=await t.DB.prepare(`
        SELECT u.id, u.nickname, u.grade, u.total_likes_received, u.created_at,
          u.wishlist_public, u.mbti,
          gs.grade_name, gs.emoji_url as grade_emoji_url, gs.is_special as grade_is_special
        FROM users u
        LEFT JOIN grade_settings gs ON gs.grade_key = u.grade
        WHERE u.id = ?
      `).bind(n).first();if(!_)return new Response(JSON.stringify({ok:!1,message:"\uC720\uC800\uB97C \uCC3E\uC744 \uC218 \uC5C6\uC5B4\uC694"}),{status:404,headers:e});let{results:c}=await t.DB.prepare(`
        SELECT r.id, r.tmdb_id, r.score, r.text, r.emotions, r.custom_tags,
          r.likes, r.spoiler, r.created_at,
          COALESCE(rk.title_ko,  wk.title_ko)    as title_ko,
          COALESCE(rk.poster_path, wk.poster_path) as poster_path,
          COALESCE(rk.category,  wk.media_type)  as category,
          rk.release_year
        FROM reviews r
        LEFT JOIN (
          SELECT tmdb_id, title_ko, poster_path, category, release_year
          FROM rankings
          WHERE tmdb_id IN (SELECT tmdb_id FROM reviews WHERE user_id = ?)
          GROUP BY tmdb_id
        ) rk ON rk.tmdb_id = r.tmdb_id
        LEFT JOIN works wk ON wk.tmdb_id = r.tmdb_id
        WHERE r.user_id = ?
        ORDER BY r.created_at DESC
      `).bind(n,n).all(),d=[];if(_.wishlist_public){let{results:u}=await t.DB.prepare(`
          SELECT w.*,
            COALESCE(rk.title_ko, w.title_ko) as title_ko,
            COALESCE(rk.poster_path, w.poster_path) as poster_path,
            COALESCE(rk.category, w.category, 'movie') as category,
            rk.release_year
          FROM wishlist w
          LEFT JOIN (
            SELECT tmdb_id, title_ko, poster_path, category, release_year
            FROM rankings
            WHERE tmdb_id IN (SELECT tmdb_id FROM wishlist WHERE user_id = ?)
            GROUP BY tmdb_id
          ) rk ON rk.tmdb_id = w.tmdb_id
          WHERE w.user_id = ?
          ORDER BY w.created_at DESC
        `).bind(n,n).all();d=u}let{results:s}=await t.DB.prepare(`
        SELECT id, board_type, title, like_count, view_count, created_at
        FROM posts WHERE user_id = ? AND is_hidden = 0 ORDER BY created_at DESC
      `).bind(n).all(),{results:a}=await t.DB.prepare(`
        SELECT lw.*,
          COALESCE(wk.poster_path, lw.poster_path) as poster_path,
          COALESCE(wk.title_ko, lw.title_ko) as title_ko
        FROM life_works lw
        LEFT JOIN works wk ON wk.tmdb_id = lw.tmdb_id
        WHERE lw.user_id = ?
        ORDER BY lw.created_at DESC
      `).bind(n).all(),{results:l}=await t.DB.prepare("SELECT * FROM pick_lists WHERE user_id = ? AND is_public = 1 ORDER BY created_at DESC").bind(n).all(),p=await Promise.all(l.map(async u=>{let{results:g}=await t.DB.prepare("SELECT * FROM pick_list_works WHERE pick_list_id = ? ORDER BY sort_order ASC, created_at DESC").bind(u.id).all();return{...u,works:g,work_count:g.length}}));return new Response(JSON.stringify({ok:!0,is_own:!1,user:_,reviews:c,wishlist:d,wishlist_hidden:!_.wishlist_public,posts:s,life_works:a,pick_lists:p,stats:{review_count:c.length,wishlist_count:_.wishlist_public?d.length:null,likes_received:_.total_likes_received||0,post_count:s.length,life_work_count:a.length,pick_list_count:p.length}}),{headers:e})}catch(n){return new Response(JSON.stringify({ok:!1,message:n.message}),{status:500,headers:e})}if(r==="/mypage/reviews"&&i.method==="GET")try{let _=(i.headers.get("Authorization")||"").replace("Bearer ","").trim()||L(i);if(!_)return new Response(JSON.stringify({ok:!1,message:"\uB85C\uADF8\uC778 \uD544\uC694"}),{status:401,headers:e});let c=await t.DB.prepare("SELECT user_id FROM sessions WHERE id = ? AND expires_at > datetime('now')").bind(_).first();if(!c)return new Response(JSON.stringify({ok:!1,message:"\uC138\uC158 \uB9CC\uB8CC"}),{status:401,headers:e});let d=await t.DB.prepare("SELECT nickname FROM users WHERE id = ?").bind(c.user_id).first(),{results:s}=await t.DB.prepare(`
        SELECT r.id, r.tmdb_id, r.score, r.text, r.emotions, r.custom_tags,
          r.likes, r.spoiler, r.created_at,
          COALESCE(rk.title_ko,  wk.title_ko)    as title_ko,
          COALESCE(rk.poster_path, wk.poster_path) as poster_path,
          COALESCE(rk.category,  wk.media_type)  as category,
          rk.release_year
        FROM reviews r
        LEFT JOIN (
          SELECT tmdb_id, title_ko, poster_path, category, release_year
          FROM rankings
          WHERE tmdb_id IN (SELECT tmdb_id FROM reviews WHERE user_id = ?)
          GROUP BY tmdb_id
        ) rk ON rk.tmdb_id = r.tmdb_id
        LEFT JOIN works wk ON wk.tmdb_id = r.tmdb_id
        WHERE r.user_id = ?
        ORDER BY r.created_at DESC
      `).bind(c.user_id,c.user_id).all();return new Response(JSON.stringify({ok:!0,reviews:s,nickname:d?.nickname||"\uB098"}),{headers:e})}catch(n){return new Response(JSON.stringify({ok:!1,message:n.message}),{status:500,headers:e})}if(r.match(/^\/user\/\d+\/reviews$/)&&i.method==="GET")try{let n=parseInt(r.split("/")[2]),_=await t.DB.prepare("SELECT nickname FROM users WHERE id = ?").bind(n).first();if(!_)return new Response(JSON.stringify({ok:!1,message:"\uC720\uC800\uB97C \uCC3E\uC744 \uC218 \uC5C6\uC5B4\uC694"}),{status:404,headers:e});let d=(i.headers.get("Authorization")||"").replace("Bearer ","").trim()||L(i),s=-1;if(d){let l=await t.DB.prepare("SELECT user_id FROM sessions WHERE id = ? AND expires_at > datetime('now')").bind(d).first();l&&(s=l.user_id)}let{results:a}=await t.DB.prepare(`
        SELECT r.id, r.tmdb_id, r.score, r.text, r.emotions, r.custom_tags,
          r.likes, r.spoiler, r.created_at,
          COALESCE(rk.title_ko,  wk.title_ko)    as title_ko,
          COALESCE(rk.poster_path, wk.poster_path) as poster_path,
          COALESCE(rk.category,  wk.media_type)  as category,
          rk.release_year,
          CASE WHEN rl.id IS NOT NULL THEN 1 ELSE 0 END AS liked_by_me
        FROM reviews r
        LEFT JOIN (
          SELECT tmdb_id, title_ko, poster_path, category, release_year
          FROM rankings
          WHERE tmdb_id IN (SELECT tmdb_id FROM reviews WHERE user_id = ?)
          GROUP BY tmdb_id
        ) rk ON rk.tmdb_id = r.tmdb_id
        LEFT JOIN works wk ON wk.tmdb_id = r.tmdb_id
        LEFT JOIN review_likes rl ON rl.review_id = r.id AND rl.user_id = ? AND rl.is_active = 1
        WHERE r.user_id = ?
        ORDER BY r.created_at DESC
      `).bind(n,s,n).all();return new Response(JSON.stringify({ok:!0,reviews:a,nickname:_.nickname||"\uC720\uC800"}),{headers:e})}catch(n){return new Response(JSON.stringify({ok:!1,message:n.message}),{status:500,headers:e})}if(r==="/life-works"&&i.method==="POST")try{let _=(i.headers.get("Authorization")||"").replace("Bearer ","").trim()||L(i);if(!_)return new Response(JSON.stringify({ok:!1,message:"\uB85C\uADF8\uC778 \uD544\uC694"}),{status:401,headers:e});let c=await t.DB.prepare("SELECT user_id FROM sessions WHERE id = ? AND expires_at > datetime('now')").bind(_).first();if(!c)return new Response(JSON.stringify({ok:!1,message:"\uC138\uC158 \uB9CC\uB8CC"}),{status:401,headers:e});let{tmdb_id:d,title_ko:s,poster_path:a,media_type:l}=await i.json();return d?await t.DB.prepare("SELECT id FROM life_works WHERE user_id = ? AND tmdb_id = ?").bind(c.user_id,parseInt(d)).first()?(await t.DB.prepare("DELETE FROM life_works WHERE user_id = ? AND tmdb_id = ?").bind(c.user_id,parseInt(d)).run(),new Response(JSON.stringify({ok:!0,saved:!1}),{headers:e})):(await t.DB.prepare("INSERT INTO life_works (user_id, tmdb_id, title_ko, poster_path, media_type) VALUES (?, ?, ?, ?, ?)").bind(c.user_id,parseInt(d),s||"",a||"",l||"tv").run(),f.waitUntil(W(c.user_id,2,"life_work",t)),new Response(JSON.stringify({ok:!0,saved:!0}),{headers:e})):new Response(JSON.stringify({ok:!1,message:"tmdb_id \uD544\uC694"}),{status:400,headers:e})}catch(n){return new Response(JSON.stringify({ok:!1,message:n.message}),{status:500,headers:e})}if(r.match(/^\/life-works\/check\/\d+$/)&&i.method==="GET")try{let n=parseInt(r.split("/")[3]),c=(i.headers.get("Authorization")||"").replace("Bearer ","").trim()||L(i);if(!c)return new Response(JSON.stringify({ok:!0,saved:!1}),{headers:e});let d=await t.DB.prepare("SELECT user_id FROM sessions WHERE id = ? AND expires_at > datetime('now')").bind(c).first();if(!d)return new Response(JSON.stringify({ok:!0,saved:!1}),{headers:e});let s=await t.DB.prepare("SELECT id FROM life_works WHERE user_id = ? AND tmdb_id = ?").bind(d.user_id,n).first();return new Response(JSON.stringify({ok:!0,saved:!!s}),{headers:e})}catch{return new Response(JSON.stringify({ok:!0,saved:!1}),{headers:e})}if(r==="/pick-lists"&&i.method==="GET")try{let _=(i.headers.get("Authorization")||"").replace("Bearer ","").trim()||L(i);if(!_)return new Response(JSON.stringify({ok:!1,message:"\uB85C\uADF8\uC778 \uD544\uC694"}),{status:401,headers:e});let c=await t.DB.prepare("SELECT user_id FROM sessions WHERE id = ? AND expires_at > datetime('now')").bind(_).first();if(!c)return new Response(JSON.stringify({ok:!1,message:"\uC138\uC158 \uB9CC\uB8CC"}),{status:401,headers:e});let{results:d}=await t.DB.prepare("SELECT * FROM pick_lists WHERE user_id = ? ORDER BY created_at DESC").bind(c.user_id).all(),s=await Promise.all(d.map(async a=>{let{results:l}=await t.DB.prepare("SELECT * FROM pick_list_works WHERE pick_list_id = ? ORDER BY sort_order ASC, created_at DESC").bind(a.id).all();return{...a,works:l,work_count:l.length}}));return new Response(JSON.stringify({ok:!0,data:s}),{headers:e})}catch(n){return new Response(JSON.stringify({ok:!1,message:n.message}),{status:500,headers:e})}if(r==="/pick-lists"&&i.method==="POST")try{let _=(i.headers.get("Authorization")||"").replace("Bearer ","").trim()||L(i);if(!_)return new Response(JSON.stringify({ok:!1,message:"\uB85C\uADF8\uC778 \uD544\uC694"}),{status:401,headers:e});let c=await t.DB.prepare("SELECT user_id FROM sessions WHERE id = ? AND expires_at > datetime('now')").bind(_).first();if(!c)return new Response(JSON.stringify({ok:!1,message:"\uC138\uC158 \uB9CC\uB8CC"}),{status:401,headers:e});let{title:d,description:s,is_public:a}=await i.json();if(!d||!d.trim())return new Response(JSON.stringify({ok:!1,message:"\uCEEC\uB809\uC158 \uC81C\uBAA9\uC744 \uC785\uB825\uD574\uC8FC\uC138\uC694"}),{status:400,headers:e});let l=await t.DB.prepare("INSERT INTO pick_lists (user_id, title, description, is_public) VALUES (?, ?, ?, ?)").bind(c.user_id,d.trim().slice(0,50),(s||"").slice(0,200),a!==!1?1:0).run(),p=await t.DB.prepare("SELECT id FROM pick_lists WHERE user_id = ? ORDER BY id DESC LIMIT 1").bind(c.user_id).first();return f.waitUntil(W(c.user_id,2,"pick_list",t)),new Response(JSON.stringify({ok:!0,id:p?.id||null}),{headers:e})}catch(n){return new Response(JSON.stringify({ok:!1,message:n.message}),{status:500,headers:e})}if(r.match(/^\/pick-lists\/\d+$/)&&i.method==="DELETE")try{let n=parseInt(r.split("/")[2]),c=(i.headers.get("Authorization")||"").replace("Bearer ","").trim()||L(i);if(!c)return new Response(JSON.stringify({ok:!1,message:"\uB85C\uADF8\uC778 \uD544\uC694"}),{status:401,headers:e});let d=await t.DB.prepare("SELECT user_id FROM sessions WHERE id = ? AND expires_at > datetime('now')").bind(c).first();return d?await t.DB.prepare("SELECT id FROM pick_lists WHERE id = ? AND user_id = ?").bind(n,d.user_id).first()?(await t.DB.prepare("DELETE FROM pick_lists WHERE id = ?").bind(n).run(),new Response(JSON.stringify({ok:!0}),{headers:e})):new Response(JSON.stringify({ok:!1,message:"\uCEEC\uB809\uC158\uC744 \uCC3E\uC744 \uC218 \uC5C6\uC5B4\uC694"}),{status:404,headers:e}):new Response(JSON.stringify({ok:!1,message:"\uC138\uC158 \uB9CC\uB8CC"}),{status:401,headers:e})}catch(n){return new Response(JSON.stringify({ok:!1,message:n.message}),{status:500,headers:e})}if(r.match(/^\/pick-lists\/\d+\/works$/)&&i.method==="POST")try{let n=parseInt(r.split("/")[2]),c=(i.headers.get("Authorization")||"").replace("Bearer ","").trim()||L(i);if(!c)return new Response(JSON.stringify({ok:!1,message:"\uB85C\uADF8\uC778 \uD544\uC694"}),{status:401,headers:e});let d=await t.DB.prepare("SELECT user_id FROM sessions WHERE id = ? AND expires_at > datetime('now')").bind(c).first();if(!d)return new Response(JSON.stringify({ok:!1,message:"\uC138\uC158 \uB9CC\uB8CC"}),{status:401,headers:e});if(!await t.DB.prepare("SELECT id FROM pick_lists WHERE id = ? AND user_id = ?").bind(n,d.user_id).first())return new Response(JSON.stringify({ok:!1,message:"\uCEEC\uB809\uC158\uC744 \uCC3E\uC744 \uC218 \uC5C6\uC5B4\uC694"}),{status:404,headers:e});let{tmdb_id:a,title_ko:l,poster_path:p,media_type:u}=await i.json();return a?await t.DB.prepare("SELECT id FROM pick_list_works WHERE pick_list_id = ? AND tmdb_id = ?").bind(n,parseInt(a)).first()?(await t.DB.prepare("DELETE FROM pick_list_works WHERE pick_list_id = ? AND tmdb_id = ?").bind(n,parseInt(a)).run(),new Response(JSON.stringify({ok:!0,added:!1}),{headers:e})):(await t.DB.prepare("INSERT INTO pick_list_works (pick_list_id, tmdb_id, title_ko, poster_path, media_type) VALUES (?, ?, ?, ?, ?)").bind(n,parseInt(a),l||"",p||"",u||"tv").run(),new Response(JSON.stringify({ok:!0,added:!0}),{headers:e})):new Response(JSON.stringify({ok:!1,message:"tmdb_id \uD544\uC694"}),{status:400,headers:e})}catch(n){return new Response(JSON.stringify({ok:!1,message:n.message}),{status:500,headers:e})}if(r.match(/^\/pick-lists\/check\/\d+$/)&&i.method==="GET")try{let n=parseInt(r.split("/")[3]),c=(i.headers.get("Authorization")||"").replace("Bearer ","").trim()||L(i);if(!c)return new Response(JSON.stringify({ok:!0,lists:[]}),{headers:e});let d=await t.DB.prepare("SELECT user_id FROM sessions WHERE id = ? AND expires_at > datetime('now')").bind(c).first();if(!d)return new Response(JSON.stringify({ok:!0,lists:[]}),{headers:e});let{results:s}=await t.DB.prepare("SELECT * FROM pick_lists WHERE user_id = ? ORDER BY created_at DESC").bind(d.user_id).all(),a=await Promise.all(s.map(async l=>{let p=await t.DB.prepare("SELECT id FROM pick_list_works WHERE pick_list_id = ? AND tmdb_id = ?").bind(l.id,n).first(),{results:u}=await t.DB.prepare("SELECT COUNT(*) as cnt FROM pick_list_works WHERE pick_list_id = ?").bind(l.id).all();return{...l,has_work:!!p,work_count:u[0]?.cnt||0}}));return new Response(JSON.stringify({ok:!0,lists:a}),{headers:e})}catch{return new Response(JSON.stringify({ok:!0,lists:[]}),{headers:e})}if(r==="/reviews/recent"&&i.method==="GET")try{let n=new URL(i.url).searchParams,_=Math.min(parseInt(n.get("limit")||"5"),20),c=Math.max(1,parseInt(n.get("page")||"1")),d=(c-1)*_,a=(i.headers.get("Authorization")||"").replace("Bearer ","").trim()||L(i),l=-1;if(a){let m=await t.DB.prepare("SELECT user_id FROM sessions WHERE id = ? AND expires_at > datetime('now')").bind(a).first();m&&(l=m.user_id)}let u=(await t.DB.prepare("SELECT COUNT(*) AS total FROM reviews").first())?.total||0,{results:g}=await t.DB.prepare(`
        SELECT r.id, r.user_id, r.tmdb_id, r.score, r.text AS body,
               r.emotions, r.created_at, r.likes,
               COALESCE(
                 wk.title_ko,
                 (SELECT title_ko FROM rankings WHERE tmdb_id = r.tmdb_id ORDER BY date DESC LIMIT 1)
               ) AS title_ko,
               wk.media_type AS media_type,
               wk.poster_path AS poster_path,
               u.nickname, u.profile_image, u.mbti,
               CASE WHEN rl.id IS NOT NULL THEN 1 ELSE 0 END AS liked_by_me
        FROM reviews r
        JOIN users u ON u.id = r.user_id
        LEFT JOIN works wk ON wk.tmdb_id = r.tmdb_id
        LEFT JOIN review_likes rl ON rl.review_id = r.id AND rl.user_id = ? AND rl.is_active = 1
        ORDER BY r.created_at DESC
        LIMIT ? OFFSET ?
      `).bind(l,_,d).all();return new Response(JSON.stringify({ok:!0,reviews:g||[],total:u,page:c,limit:_}),{headers:e})}catch(n){return new Response(JSON.stringify({ok:!1,message:n.message}),{status:500,headers:e})}if(r==="/grade-settings"&&i.method==="GET")try{let{results:n}=await t.DB.prepare("SELECT * FROM grade_settings ORDER BY sort_order ASC").all();return new Response(JSON.stringify({ok:!0,data:n}),{headers:e})}catch(n){return new Response(JSON.stringify({ok:!1,message:n.message}),{status:500,headers:e})}if(r==="/reviews/share"&&i.method==="POST")try{let _=(i.headers.get("Authorization")||"").replace("Bearer ","").trim()||L(i);if(!_)return new Response(JSON.stringify({ok:!1,message:"\uB85C\uADF8\uC778 \uD544\uC694"}),{status:401,headers:e});let c=await t.DB.prepare("SELECT user_id FROM sessions WHERE id = ? AND expires_at > datetime('now')").bind(_).first();if(!c)return new Response(JSON.stringify({ok:!1,message:"\uC138\uC158 \uB9CC\uB8CC"}),{status:401,headers:e});let d=new Date(Date.now()+540*60*1e3).toISOString().slice(0,10);return await t.DB.prepare(`SELECT id FROM user_point_logs
         WHERE user_id = ? AND reason = 'share'
         AND DATE(created_at) = ?
         LIMIT 1`).bind(c.user_id,d).first()?new Response(JSON.stringify({ok:!0,already:!0,message:"\uC624\uB298\uC740 \uC774\uBBF8 \uACF5\uC720 \uC624\uB728\uB97C \uBC1B\uC558\uC5B4\uC694"}),{headers:e}):(await W(c.user_id,10,"share",t),new Response(JSON.stringify({ok:!0,already:!1,points:10}),{headers:e}))}catch(n){return new Response(JSON.stringify({ok:!1,message:n.message}),{status:500,headers:e})}if(r==="/admin/reviews"&&i.method==="GET"){if(i.headers.get("Authorization")!==`Bearer ${t.ADMIN_SECRET}`)return new Response(JSON.stringify({ok:!1,message:"Unauthorized"}),{status:401,headers:e});try{let n=new URL(i.url),_=(n.searchParams.get("q")||"").trim(),c=Math.max(1,parseInt(n.searchParams.get("page")||"1")),d=Math.min(parseInt(n.searchParams.get("limit")||"20"),50),s=(c-1)*d,a=_?"WHERE u.nickname LIKE ? OR w.title_ko LIKE ?":"",l=_?[`%${_}%`,`%${_}%`]:[],[p,u]=await t.DB.batch([t.DB.prepare(`
          SELECT r.id, r.tmdb_id, r.score, r.text, r.emotions, r.likes, r.created_at,
                 u.nickname, w.title_ko, w.poster_path
          FROM reviews r
          JOIN users u ON r.user_id = u.id
          LEFT JOIN works w ON r.tmdb_id = w.tmdb_id
          ${a}
          ORDER BY r.created_at DESC
          LIMIT ? OFFSET ?
        `).bind(...l,d,s),t.DB.prepare(`
          SELECT COUNT(*) as cnt
          FROM reviews r
          JOIN users u ON r.user_id = u.id
          LEFT JOIN works w ON r.tmdb_id = w.tmdb_id
          ${a}
        `).bind(...l)]),g=p.results||[],m=u.results?.[0]?.cnt||0;return new Response(JSON.stringify({ok:!0,data:g,total:m,page:c,limit:d}),{headers:e})}catch(n){return new Response(JSON.stringify({ok:!1,message:n.message}),{status:500,headers:e})}}let o=r.match(/^\/admin\/reviews\/(\d+)$/);if(i.method==="DELETE"&&o){if(i.headers.get("Authorization")!==`Bearer ${t.ADMIN_SECRET}`)return new Response(JSON.stringify({ok:!1,message:"Unauthorized"}),{status:401,headers:e});try{let n=o[1],_=await t.DB.prepare("SELECT id, user_id FROM reviews WHERE id = ?").bind(n).first();return _?(await t.DB.prepare("DELETE FROM reviews WHERE id = ?").bind(n).run(),_.user_id&&f.waitUntil(U(_.user_id,t)),new Response(JSON.stringify({ok:!0}),{headers:e})):new Response(JSON.stringify({ok:!1,message:"\uCC3E\uC744 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4"}),{status:404,headers:e})}catch(n){return new Response(JSON.stringify({ok:!1,message:n.message}),{status:500,headers:e})}}return null}async function lt(r,i,t,f,e,o){if(r==="/posts"&&i.method==="GET")try{let n=e.searchParams.get("board")||"free",_=parseInt(e.searchParams.get("page")||"1"),c=20,d=(_-1)*c,{results:s}=await t.DB.prepare(`
        SELECT p.id, p.board_type, p.title, p.like_count, p.view_count,
          p.created_at, p.is_hidden,
          u.nickname, u.grade,
          gs.emoji_url as grade_emoji_url, gs.grade_name
        FROM posts p
        JOIN users u ON p.user_id = u.id
        LEFT JOIN grade_settings gs ON gs.grade_key = u.grade
        WHERE p.board_type = ? AND p.is_hidden = 0
        ORDER BY p.created_at DESC
        LIMIT ? OFFSET ?
      `).bind(n,c,d).all(),a=await t.DB.prepare("SELECT COUNT(*) as cnt FROM posts WHERE board_type = ? AND is_hidden = 0").bind(n).first();return new Response(JSON.stringify({ok:!0,data:s,total:a?.cnt||0,page:_,limit:c}),{headers:o})}catch(n){return new Response(JSON.stringify({ok:!1,message:n.message}),{status:500,headers:o})}if(r.match(/^\/posts\/\d+$/)&&i.method==="GET")try{let n=parseInt(r.split("/")[2]);await t.DB.prepare("UPDATE posts SET view_count = view_count + 1 WHERE id = ?").bind(n).run();let _=await t.DB.prepare(`
        SELECT p.*, u.nickname, u.grade,
          gs.emoji_url as grade_emoji_url, gs.grade_name
        FROM posts p
        JOIN users u ON p.user_id = u.id
        LEFT JOIN grade_settings gs ON gs.grade_key = u.grade
        WHERE p.id = ? AND p.is_hidden = 0
      `).bind(n).first();return _?new Response(JSON.stringify({ok:!0,data:_}),{headers:o}):new Response(JSON.stringify({ok:!1,message:"Not found"}),{status:404,headers:o})}catch(n){return new Response(JSON.stringify({ok:!1,message:n.message}),{status:500,headers:o})}if(r==="/posts"&&i.method==="POST")try{let _=(i.headers.get("Authorization")||"").replace("Bearer ","").trim()||L(i);if(!_)return new Response(JSON.stringify({ok:!1,message:"\uB85C\uADF8\uC778 \uD544\uC694"}),{status:401,headers:o});let c=await t.DB.prepare("SELECT user_id FROM sessions WHERE id = ? AND expires_at > datetime('now')").bind(_).first();if(!c)return new Response(JSON.stringify({ok:!1,message:"\uC138\uC158 \uB9CC\uB8CC"}),{status:401,headers:o});let d=await i.json(),{board_type:s,title:a,content:l}=d;if(!["recommend","free","community"].includes(s))return new Response(JSON.stringify({ok:!1,message:"\uC62C\uBC14\uB978 \uAC8C\uC2DC\uD310\uC744 \uC120\uD0DD\uD574\uC8FC\uC138\uC694"}),{status:400,headers:o});if(!a||a.trim().length<2)return new Response(JSON.stringify({ok:!1,message:"\uC81C\uBAA9\uC740 2\uC790 \uC774\uC0C1 \uC785\uB825\uD574\uC8FC\uC138\uC694"}),{status:400,headers:o});if(a.trim().length>100)return new Response(JSON.stringify({ok:!1,message:"\uC81C\uBAA9\uC740 100\uC790 \uC774\uB0B4\uB85C \uC785\uB825\uD574\uC8FC\uC138\uC694"}),{status:400,headers:o});if(!l||l.trim().length<5)return new Response(JSON.stringify({ok:!1,message:"\uB0B4\uC6A9\uC740 5\uC790 \uC774\uC0C1 \uC785\uB825\uD574\uC8FC\uC138\uC694"}),{status:400,headers:o});let p=await t.DB.prepare("INSERT INTO posts (board_type, user_id, title, content) VALUES (?, ?, ?, ?)").bind(s,c.user_id,a.trim(),l.trim()).run();return f.waitUntil(U(c.user_id,t)),new Response(JSON.stringify({ok:!0,id:p.meta?.last_row_id}),{headers:o})}catch(n){return new Response(JSON.stringify({ok:!1,message:n.message}),{status:500,headers:o})}if(r.match(/^\/posts\/\d+$/)&&i.method==="PATCH")try{let n=parseInt(r.split("/")[2]),c=(i.headers.get("Authorization")||"").replace("Bearer ","").trim()||L(i);if(!c)return new Response(JSON.stringify({ok:!1,message:"\uB85C\uADF8\uC778 \uD544\uC694"}),{status:401,headers:o});let d=await t.DB.prepare("SELECT user_id FROM sessions WHERE id = ? AND expires_at > datetime('now')").bind(c).first();if(!d)return new Response(JSON.stringify({ok:!1,message:"\uC138\uC158 \uB9CC\uB8CC"}),{status:401,headers:o});let s=await t.DB.prepare("SELECT user_id FROM posts WHERE id = ?").bind(n).first();if(!s)return new Response(JSON.stringify({ok:!1,message:"\uAC8C\uC2DC\uAE00 \uC5C6\uC74C"}),{status:404,headers:o});if(s.user_id!==d.user_id)return new Response(JSON.stringify({ok:!1,message:"\uAD8C\uD55C \uC5C6\uC74C"}),{status:403,headers:o});let a=await i.json(),{title:l,content:p}=a;return await t.DB.prepare("UPDATE posts SET title = ?, content = ?, updated_at = datetime('now') WHERE id = ?").bind(l.trim(),p.trim(),n).run(),new Response(JSON.stringify({ok:!0}),{headers:o})}catch(n){return new Response(JSON.stringify({ok:!1,message:n.message}),{status:500,headers:o})}if(r.match(/^\/posts\/\d+$/)&&i.method==="DELETE")try{let n=parseInt(r.split("/")[2]),c=(i.headers.get("Authorization")||"").replace("Bearer ","").trim()||L(i);if(!c)return new Response(JSON.stringify({ok:!1,message:"\uB85C\uADF8\uC778 \uD544\uC694"}),{status:401,headers:o});let d=await t.DB.prepare("SELECT user_id FROM sessions WHERE id = ? AND expires_at > datetime('now')").bind(c).first();if(!d)return new Response(JSON.stringify({ok:!1,message:"\uC138\uC158 \uB9CC\uB8CC"}),{status:401,headers:o});let s=await t.DB.prepare("SELECT user_id FROM posts WHERE id = ?").bind(n).first();return s?s.user_id!==d.user_id?new Response(JSON.stringify({ok:!1,message:"\uAD8C\uD55C \uC5C6\uC74C"}),{status:403,headers:o}):(await t.DB.prepare("DELETE FROM posts WHERE id = ?").bind(n).run(),f.waitUntil(U(d.user_id,t)),new Response(JSON.stringify({ok:!0}),{headers:o})):new Response(JSON.stringify({ok:!1,message:"\uAC8C\uC2DC\uAE00 \uC5C6\uC74C"}),{status:404,headers:o})}catch(n){return new Response(JSON.stringify({ok:!1,message:n.message}),{status:500,headers:o})}if(r.match(/^\/posts\/\d+\/like$/)&&i.method==="POST")try{let n=parseInt(r.split("/")[2]),_=await t.DB.prepare("SELECT user_id FROM posts WHERE id = ?").bind(n).first();return await t.DB.prepare("UPDATE posts SET like_count = like_count + 1 WHERE id = ?").bind(n).run(),_?.user_id&&(await t.DB.prepare("UPDATE users SET total_likes_received = total_likes_received + 1 WHERE id = ?").bind(_.user_id).run(),f.waitUntil(U(_.user_id,t))),new Response(JSON.stringify({ok:!0}),{headers:o})}catch(n){return new Response(JSON.stringify({ok:!1,message:n.message}),{status:500,headers:o})}return null}async function G(r,i,t,f,e){let o=r.match(/^\/work-ott\/(\d+)$/);if(o&&i.method==="GET"){let s=parseInt(o[1]);try{let{results:a}=await t.DB.prepare(`SELECT id, tmdb_id, ott_key, action, created_at
         FROM work_ott_overrides
         WHERE tmdb_id = ?
         ORDER BY created_at DESC`).bind(s).all();return new Response(JSON.stringify({ok:!0,data:a||[]}),{headers:e})}catch(a){return new Response(JSON.stringify({ok:!1,error:a.message}),{status:500,headers:e})}}if(r==="/work-ott"&&i.method==="POST"){if(!N(i,t))return new Response(JSON.stringify({ok:!1,error:"Unauthorized"}),{status:401,headers:e});try{let s=await i.json(),{tmdb_id:a,ott_key:l,action:p}=s;return!a||!l||!p?new Response(JSON.stringify({ok:!1,error:"tmdb_id, ott_key, action \uD544\uC218"}),{status:400,headers:e}):["add","remove"].includes(p)?(await t.DB.prepare(`INSERT INTO work_ott_overrides (tmdb_id, ott_key, action)
         VALUES (?, ?, ?)
         ON CONFLICT(tmdb_id, ott_key)
         DO UPDATE SET action = excluded.action,
                       created_at = datetime('now')`).bind(a,l,p).run(),new Response(JSON.stringify({ok:!0}),{headers:e})):new Response(JSON.stringify({ok:!1,error:"action\uC740 'add' \uB610\uB294 'remove'\uB9CC \uD5C8\uC6A9"}),{status:400,headers:e})}catch(s){return new Response(JSON.stringify({ok:!1,error:s.message}),{status:500,headers:e})}}let n=r.match(/^\/work-ott\/(\d+)$/);if(n&&i.method==="DELETE"){if(!N(i,t))return new Response(JSON.stringify({ok:!1,error:"Unauthorized"}),{status:401,headers:e});let s=parseInt(n[1]);try{return await t.DB.prepare("DELETE FROM work_ott_overrides WHERE id = ?").bind(s).run(),new Response(JSON.stringify({ok:!0}),{headers:e})}catch(a){return new Response(JSON.stringify({ok:!1,error:a.message}),{status:500,headers:e})}}if(r==="/admin/title-map"&&i.method==="GET"){if(!N(i,t))return new Response(JSON.stringify({ok:!1,message:"Unauthorized"}),{status:401,headers:e});try{let s=parseInt(f.searchParams.get("page")||"1"),a=50,l=(s-1)*a,{results:p}=await t.DB.prepare("SELECT * FROM title_map ORDER BY created_at DESC LIMIT ? OFFSET ?").bind(a,l).all();return new Response(JSON.stringify({ok:!0,data:p}),{headers:e})}catch(s){return new Response(JSON.stringify({ok:!1,message:s.message}),{status:500,headers:e})}}if(r==="/admin/rankings"&&i.method==="POST"){if(!N(i,t))return new Response(JSON.stringify({ok:!1,message:"Unauthorized"}),{status:401,headers:e});try{let s=await i.json(),{platform:a,category_slot:l,date:p,tmdb_id:u,rank:g,title_ko:m,title_en:E,media_type:w,is_manual:y}=s;if(!a||!l||!p||!u||!m)return new Response(JSON.stringify({ok:!1,message:"platform, category_slot, date, tmdb_id, title_ko \uD544\uC218"}),{status:400,headers:e});let k=null,S=m||null,R=E||null,b=null,T=null,D=null,O=w==="tv"||w==="movie"?w:null;try{let C=O?[O]:["tv","movie"];for(let I of C){let J=await fetch(`https://api.themoviedb.org/3/${I}/${u}?language=ko-KR&api_key=${t.TMDB_API_KEY}`);if(!J.ok)continue;let B=await J.json();if(!(!B.poster_path&&!B.name&&!B.title)){if(k=B.poster_path||null,b=parseInt((B.first_air_date||B.release_date||"").slice(0,4))||null,D=B.vote_average?parseFloat(B.vote_average.toFixed(1)):null,T=(B.genres||[]).map(H=>H.name).join(", ")||null,O||(O=I),S||(S=B.name||B.title||null),!R){let H=await fetch(`https://api.themoviedb.org/3/${I}/${u}?language=en-US&api_key=${t.TMDB_API_KEY}`);if(H.ok){let F=await H.json(),M=F.original_title||F.original_name||"",P=F.title||F.name||"";R=/[\uAC00-\uD7A3]/.test(M)?P:M||P}}break}}}catch{}await t.DB.prepare(`
        INSERT INTO works (tmdb_id, title_ko, title_en, poster_path, media_type, match_source, confidence_score)
        VALUES (?, ?, ?, ?, ?, 'admin', 100)
        ON CONFLICT(tmdb_id) DO UPDATE SET
          title_ko         = COALESCE(?, title_ko),
          title_en         = COALESCE(NULLIF(?, ''), title_en),
          poster_path      = COALESCE(?, poster_path),
          media_type       = COALESCE(?, media_type),
          match_source     = 'admin',
          confidence_score = 100,
          updated_at       = datetime('now')
      `).bind(parseInt(u),S||"",R||"",k,O,S||null,R||null,k,O).run();let h=parseInt(g)||null;return h||(h=((await t.DB.prepare("SELECT MAX(rank) as max_rank FROM rankings WHERE platform = ? AND category_slot = ? AND date = ?").bind(a,l,p).first())?.max_rank||0)+1),await t.DB.prepare(`
        INSERT INTO rankings
          (platform, category_slot, category, date, rank, tmdb_id,
           title_ko, title_en, poster_path, release_year, genre, tmdb_rating,
           is_manual, source_name)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).bind(a,l,l,p,-h,parseInt(u),S||"",R||"",k,b,T,D,y?1:0,l).run(),await t.DB.prepare("UPDATE rankings SET rank = ? WHERE platform = ? AND category_slot = ? AND date = ? AND rank = ?").bind(h,a,l,p,-h).run(),R&&S&&await t.DB.prepare(`
          INSERT INTO title_map (title_en, title_ko, tmdb_id)
          VALUES (?, ?, ?)
          ON CONFLICT(title_en) DO UPDATE SET
            title_ko = excluded.title_ko,
            tmdb_id  = COALESCE(excluded.tmdb_id, tmdb_id)
        `).bind(R.trim(),S.trim(),parseInt(u)).run(),await t.DB.prepare("INSERT INTO admin_logs (action, platform, category_slot, target_id, after_value) VALUES ('ranking_add', ?, ?, ?, ?)").bind(a,l,String(u),JSON.stringify({rank:h,title_ko:S,date:p})).run(),new Response(JSON.stringify({ok:!0,rank:h,poster_path:k,title_ko:S,title_en:R}),{headers:e})}catch(s){return new Response(JSON.stringify({ok:!1,message:s.message}),{status:500,headers:e})}}if(r==="/admin/rankings"&&i.method==="GET"){if(!N(i,t))return new Response(JSON.stringify({ok:!1,message:"Unauthorized"}),{status:401,headers:e});let s=f.searchParams.get("date"),a=f.searchParams.get("manual"),l,p;a==="true"?(l="SELECT * FROM rankings WHERE date = 'manual' ORDER BY platform, category_slot, rank",p=null):s?(l="SELECT * FROM rankings WHERE date = ? ORDER BY platform, category_slot, rank",p=s):(l="SELECT * FROM rankings WHERE date = (SELECT value FROM app_settings WHERE key = 'latest_ranking_date') ORDER BY platform, category_slot, rank",p=null);let{results:u}=p?await t.DB.prepare(l).bind(p).all():await t.DB.prepare(l).all();return new Response(JSON.stringify({ok:!0,data:u}),{headers:e})}if(r==="/admin/fix"&&i.method==="POST"){if(!N(i,t))return new Response(JSON.stringify({ok:!1,message:"Unauthorized"}),{status:401,headers:e});try{let s=await i.json(),{id:a,tmdb_id:l,title_ko:p,title_en:u,delete_duplicates:g,media_type:m}=s,E=s.season!==void 0?s.season:void 0,w=s.poster_path||null;if(!a)return new Response(JSON.stringify({ok:!1,message:"id required"}),{status:400,headers:e});let y=null,k=p||null,S=u||null,R=await t.DB.prepare("SELECT title_ko, title_en, poster_path FROM rankings WHERE id = ?").bind(parseInt(a)).first();if(l)try{let O=m==="movie"?["movie"]:m==="tv"?["tv"]:["tv","movie"];for(let h of O){let C=await fetch(`https://api.themoviedb.org/3/${h}/${l}?language=ko-KR&api_key=${t.TMDB_API_KEY}`);if(!C.ok)continue;let I=await C.json();if(!(!I.poster_path&&!I.name&&!I.title)){if(y=I.poster_path||null,k||(k=I.name||I.title||null),!S){let J=await fetch(`https://api.themoviedb.org/3/${h}/${l}?language=en-US&api_key=${t.TMDB_API_KEY}`);if(J.ok){let B=await J.json(),H=B.original_title||B.original_name||"",F=B.title||B.name||"";S=/[\uAC00-\uD7A3]/.test(H)?F:H||F}}break}}}catch{}w&&(y=w);let b=E!==void 0?E!==null?parseInt(E):null:void 0;if(await t.DB.prepare(`
        UPDATE rankings
        SET tmdb_id     = COALESCE(?, tmdb_id),
            title_ko    = COALESCE(?, title_ko),
            title_en    = COALESCE(?, title_en),
            poster_path = COALESCE(?, poster_path),
            season      = ${b!==void 0?"?":"season"},
            is_manual   = 1
        WHERE id = ?
      `).bind(l?parseInt(l):null,k,S,y,...b!==void 0?[b]:[],parseInt(a)).run(),l){g&&(S&&await t.DB.prepare("DELETE FROM works WHERE title_en = ? AND tmdb_id != ?").bind(S,parseInt(l)).run(),k&&/[\uAC00-\uD7A3]/.test(k)&&await t.DB.prepare("DELETE FROM works WHERE title_ko = ? AND tmdb_id != ?").bind(k,parseInt(l)).run(),await t.DB.prepare("INSERT INTO admin_logs (action, target_id, memo) VALUES ('works_delete', ?, ?)").bind(String(l),`\uC911\uBCF5 \uC0AD\uC81C: title_en="${S}" title_ko="${k}"`).run());let O=m==="tv"||m==="movie"?m:null,h=w?null:y;await t.DB.prepare(`
          INSERT INTO works (tmdb_id, title_ko, title_en, poster_path, media_type)
          VALUES (?, ?, ?, ?, ?)
          ON CONFLICT(tmdb_id) DO UPDATE SET
            title_ko    = COALESCE(?, title_ko),
            title_en    = COALESCE(NULLIF(?, ''), title_en),
            poster_path = COALESCE(?, poster_path),
            media_type  = COALESCE(?, media_type),
            updated_at  = datetime('now')
        `).bind(parseInt(l),k||"",S||"",h,O,k||null,S||null,h,O).run()}let T=S||k||"",D=k||S||"";return T&&D&&l&&await t.DB.prepare(`
          INSERT INTO title_map (title_en, title_ko, tmdb_id)
          VALUES (?, ?, ?)
          ON CONFLICT(title_en) DO UPDATE SET
            title_ko = excluded.title_ko,
            tmdb_id  = COALESCE(excluded.tmdb_id, tmdb_id)
        `).bind(T.trim(),D.trim(),parseInt(l)).run(),new Response(JSON.stringify({ok:!0,poster_path:y,title_ko:k,title_en:S}),{headers:e})}catch(s){return new Response(JSON.stringify({ok:!1,message:s.message}),{status:500,headers:e})}}if(r==="/admin/unfix"&&i.method==="POST"){if(!N(i,t))return new Response(JSON.stringify({ok:!1,message:"Unauthorized"}),{status:401,headers:e});let s=await i.json(),{id:a}=s;return await t.DB.prepare("UPDATE rankings SET is_manual = 0 WHERE id = ?").bind(a).run(),new Response(JSON.stringify({ok:!0}),{headers:e})}let _=r.match(/^\/admin\/rankings\/(\d+)$/);if(_&&i.method==="PATCH"){if(!N(i,t))return new Response(JSON.stringify({ok:!1,message:"Unauthorized"}),{status:401,headers:e});try{let s=parseInt(_[1]),{is_manual:a}=await i.json();if(a!==0&&a!==2)return new Response(JSON.stringify({ok:!1,message:"is_manual \uAC12\uC740 0(\uD574\uC81C) \uB610\uB294 2(\uD06C\uB864\uB9C1\uACE0\uC815)\uB9CC \uD5C8\uC6A9\uB429\uB2C8\uB2E4."}),{status:400,headers:e});let l=await t.DB.prepare("SELECT id, platform, category_slot, title_ko FROM rankings WHERE id = ?").bind(s).first();return l?(await t.DB.prepare("UPDATE rankings SET is_manual = ? WHERE id = ?").bind(a,s).run(),await t.DB.prepare("INSERT INTO admin_logs (action, platform, category_slot, target_id, after_value) VALUES ('crawl_lock', ?, ?, ?, ?)").bind(l.platform,l.category_slot,String(s),JSON.stringify({is_manual:a,title_ko:l.title_ko})).run(),new Response(JSON.stringify({ok:!0,is_manual:a}),{headers:e})):new Response(JSON.stringify({ok:!1,message:"\uD574\uB2F9 \uB7AD\uD0B9\uC744 \uCC3E\uC744 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4."}),{status:404,headers:e})}catch(s){return new Response(JSON.stringify({ok:!1,message:s.message}),{status:500,headers:e})}}let c=r.match(/^\/admin\/rankings\/(\d+)$/);if(c&&i.method==="DELETE"){if(!N(i,t))return new Response(JSON.stringify({ok:!1,message:"Unauthorized"}),{status:401,headers:e});try{let s=parseInt(c[1]),a=await t.DB.prepare("SELECT id, platform, category_slot, title_ko, rank, is_manual FROM rankings WHERE id = ?").bind(s).first();return a?(await t.DB.prepare("DELETE FROM rankings WHERE id = ?").bind(s).run(),await t.DB.prepare("INSERT INTO admin_logs (action, platform, category_slot, target_id, after_value) VALUES ('ranking_delete', ?, ?, ?, ?)").bind(a.platform,a.category_slot,String(s),JSON.stringify({title_ko:a.title_ko,rank:a.rank,is_manual:a.is_manual})).run(),new Response(JSON.stringify({ok:!0}),{headers:e})):new Response(JSON.stringify({ok:!1,message:"\uD574\uB2F9 \uB7AD\uD0B9\uC744 \uCC3E\uC744 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4."}),{status:404,headers:e})}catch(s){return new Response(JSON.stringify({ok:!1,message:s.message}),{status:500,headers:e})}}if(r==="/admin/categories"&&i.method==="GET"){if(!N(i,t))return new Response(JSON.stringify({ok:!1,message:"Unauthorized"}),{status:401,headers:e});try{let s=f.searchParams.get("platform"),a="SELECT * FROM ott_categories",l=[];s&&(a+=" WHERE platform = ?",l.push(s)),a+=" ORDER BY platform, category_slot";let{results:p}=l.length?await t.DB.prepare(a).bind(...l).all():await t.DB.prepare(a).all();return new Response(JSON.stringify({ok:!0,data:p}),{headers:e})}catch(s){return new Response(JSON.stringify({ok:!1,message:s.message}),{status:500,headers:e})}}if(r.match(/^\/admin\/categories\/\d+$/)&&i.method==="PATCH"){if(!N(i,t))return new Response(JSON.stringify({ok:!1,message:"Unauthorized"}),{status:401,headers:e});try{let s=parseInt(r.split("/")[3]),a=await i.json(),{display_name:l,crawl_limit:p,main_limit:u,platform_limit:g,is_active:m,main_section:E,main_order:w,platform_section:y,platform_order:k,memo_label:S,hot100_eligible:R,hot100_weight:b,person_section:T,person_order:D,person_limit:O}=a;return await t.DB.prepare(`
        UPDATE ott_categories SET
          display_name     = COALESCE(?, display_name),
          crawl_limit      = COALESCE(?, crawl_limit),
          main_limit       = COALESCE(?, main_limit),
          platform_limit   = COALESCE(?, platform_limit),
          is_active        = COALESCE(?, is_active),
          main_section     = CASE WHEN ? = '__SKIP__' THEN main_section     ELSE ? END,
          main_order       = CASE WHEN ? = '__SKIP__' THEN main_order       ELSE ? END,
          platform_section = CASE WHEN ? = '__SKIP__' THEN platform_section ELSE ? END,
          platform_order   = CASE WHEN ? = '__SKIP__' THEN platform_order   ELSE ? END,
          memo_label       = CASE WHEN ? = '__SKIP__' THEN memo_label       ELSE ? END,
          hot100_eligible  = CASE WHEN ? = '__SKIP__' THEN hot100_eligible  ELSE ? END,
          hot100_weight    = COALESCE(?, hot100_weight),
          person_section   = CASE WHEN ? = '__SKIP__' THEN person_section   ELSE ? END,
          person_order     = CASE WHEN ? = '__SKIP__' THEN person_order     ELSE ? END,
          person_limit     = COALESCE(?, person_limit),
          updated_at       = datetime('now')
        WHERE id = ?
      `).bind(l??null,p??null,u??null,g??null,m??null,E===void 0?"__SKIP__":"__SET__",E===void 0?null:E||null,w===void 0?"__SKIP__":"__SET__",w===void 0?null:w??0,y===void 0?"__SKIP__":"__SET__",y===void 0?null:y||null,k===void 0?"__SKIP__":"__SET__",k===void 0?null:k??0,S===void 0?"__SKIP__":"__SET__",S===void 0?null:S||null,R===void 0?"__SKIP__":"__SET__",R===void 0?null:R??0,b??null,T===void 0?"__SKIP__":"__SET__",T===void 0?null:T||null,D===void 0?"__SKIP__":"__SET__",D===void 0?null:D??0,O??null,s).run(),await t.DB.prepare("INSERT INTO admin_logs (action, target_id, after_value) VALUES ('category_setting', ?, ?)").bind(String(s),JSON.stringify(a)).run(),new Response(JSON.stringify({ok:!0}),{headers:e})}catch(s){return new Response(JSON.stringify({ok:!1,message:s.message}),{status:500,headers:e})}}if(r==="/admin/categories"&&i.method==="POST"){if(!N(i,t))return new Response(JSON.stringify({ok:!1,message:"Unauthorized"}),{status:401,headers:e});try{let s=await i.json(),{platform:a,category_slot:l,source_name:p,display_name:u,crawl_limit:g,main_limit:m,platform_limit:E,is_active:w}=s;if(!a||!l||!p)return new Response(JSON.stringify({ok:!1,message:"platform, category_slot, source_name required"}),{status:400,headers:e});let k=((await t.DB.prepare("SELECT MAX(table_index) as max_idx FROM ott_categories WHERE platform = ?").bind(a).first())?.max_idx??-1)+1;await t.DB.prepare(`
        INSERT INTO ott_categories
          (platform, category_slot, table_index, source_name, display_name,
           crawl_limit, main_limit, platform_limit, is_active)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(platform, category_slot) DO NOTHING
      `).bind(a,l,k,p,u||p,g||20,m||10,E||20,w??1).run();let S=await t.DB.prepare("SELECT * FROM ott_categories WHERE platform = ? AND category_slot = ?").bind(a,l).first();return await t.DB.prepare("INSERT INTO admin_logs (action, platform, category_slot, after_value) VALUES ('category_create', ?, ?, ?)").bind(a,l,JSON.stringify(s)).run(),new Response(JSON.stringify({ok:!0,data:S}),{headers:e})}catch(s){return new Response(JSON.stringify({ok:!1,message:s.message}),{status:500,headers:e})}}if(r==="/admin/review-queue/count"&&i.method==="GET"){if(!N(i,t))return new Response(JSON.stringify({ok:!1,message:"Unauthorized"}),{status:401,headers:e});try{let s=await t.DB.prepare("SELECT COUNT(*) as count FROM review_queue WHERE status = 'pending'").first();return new Response(JSON.stringify({ok:!0,count:s?.count||0}),{headers:e})}catch(s){return new Response(JSON.stringify({ok:!1,message:s.message}),{status:500,headers:e})}}if(r==="/admin/review-queue"&&i.method==="GET"){if(!N(i,t))return new Response(JSON.stringify({ok:!1,message:"Unauthorized"}),{status:401,headers:e});try{let s=f.searchParams.get("status")||"pending",a=f.searchParams.get("platform"),l="SELECT * FROM review_queue WHERE status = ?",p=[s];a&&(l+=" AND platform = ?",p.push(a)),l+=" ORDER BY crawled_date DESC, platform, category_slot, rank";let{results:u}=await t.DB.prepare(l).bind(...p).all();return new Response(JSON.stringify({ok:!0,data:u}),{headers:e})}catch(s){return new Response(JSON.stringify({ok:!1,message:s.message}),{status:500,headers:e})}}if(r.match(/^\/admin\/review-queue\/\d+\/resolve$/)&&i.method==="POST"){if(!N(i,t))return new Response(JSON.stringify({ok:!1,message:"Unauthorized"}),{status:401,headers:e});try{let s=parseInt(r.split("/")[3]),a=await i.json(),{tmdb_id:l,title_ko:p,title_en:u}=a;if(!l)return new Response(JSON.stringify({ok:!1,message:"tmdb_id required"}),{status:400,headers:e});let g=await t.DB.prepare("SELECT * FROM review_queue WHERE id = ?").bind(s).first();if(!g)return new Response(JSON.stringify({ok:!1,message:"Queue item not found"}),{status:404,headers:e});let m=null,E=p,w=u;try{for(let k of["tv","movie"]){let S=await fetch(`https://api.themoviedb.org/3/${k}/${l}?language=ko-KR&api_key=${t.TMDB_API_KEY}`);if(S.ok){let R=await S.json();if(R.name||R.title){m=R.poster_path||null,E||(E=R.name||R.title);break}}}if(!w)for(let k of["tv","movie"]){let S=await fetch(`https://api.themoviedb.org/3/${k}/${l}?language=en-US&api_key=${t.TMDB_API_KEY}`);if(S.ok){let R=await S.json();if(R.name||R.title){w=R.title||R.name;break}}}}catch{}if(a.delete_duplicates===!0&&(w||g.title_en)){let k=w||g.title_en;await t.DB.prepare("DELETE FROM works WHERE title_en = ? AND tmdb_id != ?").bind(k,parseInt(l)).run(),await t.DB.prepare("INSERT INTO admin_logs (action, target_id, before_value, memo) VALUES ('works_delete', ?, ?, ?)").bind(String(l),JSON.stringify({title_en:k}),`\uC911\uBCF5 \uC0AD\uC81C: title_en="${k}" tmdb_id!=${l}`).run()}return await t.DB.prepare(`
        INSERT INTO works (tmdb_id, title_ko, title_en, poster_path, match_source, confidence_score)
        VALUES (?, ?, ?, ?, 'admin', 100)
        ON CONFLICT(tmdb_id) DO UPDATE SET
          title_ko         = COALESCE(?, title_ko),
          title_en         = COALESCE(NULLIF(?, ''), title_en),
          poster_path      = COALESCE(?, poster_path),
          match_source     = 'admin',
          confidence_score = 100,
          updated_at       = datetime('now')
      `).bind(parseInt(l),E||"",w||"",m,E||null,w||null,m).run(),await t.DB.prepare(`
        UPDATE rankings SET
          tmdb_id     = ?,
          title_ko    = COALESCE(?, title_ko),
          title_en    = COALESCE(?, title_en),
          poster_path = COALESCE(?, poster_path),
          is_manual   = 1
        WHERE platform = ? AND category_slot = ? AND rank = ? AND date = ?
      `).bind(parseInt(l),E||null,w||null,m,g.platform,g.category_slot,g.rank,g.crawled_date).run(),await t.DB.prepare(`
        UPDATE review_queue SET
          status           = 'resolved',
          resolved_tmdb_id = ?,
          resolved_at      = datetime('now')
        WHERE id = ?
      `).bind(parseInt(l),s).run(),await t.DB.prepare("INSERT INTO admin_logs (action, platform, category_slot, target_id, after_value) VALUES ('queue_resolve', ?, ?, ?, ?)").bind(g.platform,g.category_slot,String(l),JSON.stringify({tmdb_id:l,title_ko:E,title_en:w})).run(),new Response(JSON.stringify({ok:!0,poster_path:m,title_ko:E,title_en:w}),{headers:e})}catch(s){return new Response(JSON.stringify({ok:!1,message:s.message}),{status:500,headers:e})}}if(r==="/admin/rank-override"&&i.method==="POST"){if(!N(i,t))return new Response(JSON.stringify({ok:!1,message:"Unauthorized"}),{status:401,headers:e});try{let s=await i.json(),{platform:a,category_slot:l,date:p,tmdb_id:u,original_rank:g,override_rank:m,reason:E}=s;return!a||!l||!p||!u||!m?new Response(JSON.stringify({ok:!1,message:"\uD544\uC218 \uD30C\uB77C\uBBF8\uD130 \uB204\uB77D"}),{status:400,headers:e}):(await t.DB.prepare(`
        INSERT INTO rank_overrides
          (platform, category_slot, date, tmdb_id, original_rank, override_rank, reason)
        VALUES (?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(platform, category_slot, date, tmdb_id) DO UPDATE SET
          override_rank = excluded.override_rank,
          reason        = excluded.reason,
          updated_at    = datetime('now')
      `).bind(a,l,p,parseInt(u),g||0,parseInt(m),E||null).run(),await t.DB.prepare("INSERT INTO admin_logs (action, platform, category_slot, target_id, before_value, after_value) VALUES ('rank_override', ?, ?, ?, ?, ?)").bind(a,l,String(u),JSON.stringify({rank:g}),JSON.stringify({rank:m,reason:E})).run(),new Response(JSON.stringify({ok:!0}),{headers:e}))}catch(s){return new Response(JSON.stringify({ok:!1,message:s.message}),{status:500,headers:e})}}if(r==="/admin/rank-override"&&i.method==="DELETE"){if(!N(i,t))return new Response(JSON.stringify({ok:!1,message:"Unauthorized"}),{status:401,headers:e});try{let s=await i.json(),{platform:a,category_slot:l,date:p,tmdb_id:u}=s;return await t.DB.prepare("DELETE FROM rank_overrides WHERE platform = ? AND category_slot = ? AND date = ? AND tmdb_id = ?").bind(a,l,p,parseInt(u)).run(),new Response(JSON.stringify({ok:!0}),{headers:e})}catch(s){return new Response(JSON.stringify({ok:!1,message:s.message}),{status:500,headers:e})}}if(r.match(/^\/admin\/works\/\d+$/)&&i.method==="GET"){if(!N(i,t))return new Response(JSON.stringify({ok:!1,message:"Unauthorized"}),{status:401,headers:e});try{let s=parseInt(r.split("/")[3]),a=await t.DB.prepare("SELECT * FROM works WHERE tmdb_id = ?").bind(s).first();return a?new Response(JSON.stringify({ok:!0,data:a}),{headers:e}):new Response(JSON.stringify({ok:!1,message:"Not found"}),{status:404,headers:e})}catch(s){return new Response(JSON.stringify({ok:!1,message:s.message}),{status:500,headers:e})}}if(r==="/admin/works"&&i.method==="GET"){if(!N(i,t))return new Response(JSON.stringify({ok:!1,message:"Unauthorized"}),{status:401,headers:e});try{let s=f.searchParams.get("q")||"",a=f.searchParams.get("filter")||"",l=f.searchParams.get("date")||"",p=f.searchParams.get("sort")||"recent",u=parseInt(f.searchParams.get("page")||"1"),g=50,m=(u-1)*g,E=p==="updated"?"updated_at DESC, id DESC":"COALESCE(created_at, updated_at) DESC, id DESC",w,y;a==="new_match"&&l?(w=`SELECT * FROM works WHERE first_matched_date = ? AND match_source IN ('auto_claude', 'auto_tmdb') ORDER BY ${E} LIMIT ? OFFSET ?`,y=[l,g,m]):a==="adult_confirmed"&&s?(w=`SELECT * FROM works WHERE adult_flag = 1 AND (title_ko LIKE ? OR title_en LIKE ?) ORDER BY ${E} LIMIT ? OFFSET ?`,y=[`%${s}%`,`%${s}%`,g,m]):a==="adult_confirmed"?(w=`SELECT * FROM works WHERE adult_flag = 1 ORDER BY ${E} LIMIT ? OFFSET ?`,y=[g,m]):s?(w=`SELECT * FROM works WHERE title_ko LIKE ? OR title_en LIKE ? ORDER BY ${E} LIMIT ? OFFSET ?`,y=[`%${s}%`,`%${s}%`,g,m]):(w=`SELECT * FROM works ORDER BY ${E} LIMIT ? OFFSET ?`,y=[g,m]);let{results:k}=await t.DB.prepare(w).bind(...y).all();return new Response(JSON.stringify({ok:!0,data:k}),{headers:e})}catch(s){return new Response(JSON.stringify({ok:!1,message:s.message}),{status:500,headers:e})}}if(r.match(/^\/admin\/works\/\d+$/)&&i.method==="PATCH"){if(!N(i,t))return new Response(JSON.stringify({ok:!1,message:"Unauthorized"}),{status:401,headers:e});try{let s=parseInt(r.split("/")[3]),a=await i.json(),{title_ko:l,title_en:p,poster_path:u,delete_duplicates:g,media_type:m,mbti_tags:E}=a,w=m==="tv"||m==="movie"?m:null,y=E!==void 0,k=y?E||null:void 0,S=await t.DB.prepare("SELECT title_ko, title_en, poster_path, media_type FROM works WHERE tmdb_id = ?").bind(s).first();if(g&&(p||S?.title_en)){let R=p||S?.title_en;await t.DB.prepare("DELETE FROM works WHERE title_en = ? AND tmdb_id != ?").bind(R,s).run(),await t.DB.prepare("INSERT INTO admin_logs (action, target_id, before_value, memo) VALUES ('works_delete', ?, ?, ?)").bind(String(s),JSON.stringify({title_en:R}),`\uC911\uBCF5 \uC0AD\uC81C: title_en="${R}" tmdb_id!=${s}`).run()}return await t.DB.prepare(`
        UPDATE works SET
          title_ko         = COALESCE(?, title_ko),
          title_en         = COALESCE(?, title_en),
          poster_path      = COALESCE(?, poster_path),
          media_type       = ?,
          mbti_tags        = ${y?"?":"mbti_tags"},
          match_source     = 'admin',
          confidence_score = 100,
          updated_at       = datetime('now')
        WHERE tmdb_id = ?
      `).bind(l||null,p||null,u||null,w,...y?[k]:[],s).run(),await t.DB.prepare("INSERT INTO admin_logs (action, target_id, before_value, after_value) VALUES ('works_update', ?, ?, ?)").bind(String(s),JSON.stringify(S),JSON.stringify(a)).run(),new Response(JSON.stringify({ok:!0}),{headers:e})}catch(s){return new Response(JSON.stringify({ok:!1,message:s.message}),{status:500,headers:e})}}if(r.match(/^\/admin\/works\/\d+\/hero-backdrop$/)&&i.method==="PATCH"){if(!N(i,t))return new Response(JSON.stringify({ok:!1,message:"Unauthorized"}),{status:401,headers:e});try{let s=parseInt(r.split("/")[3]),a=await i.json(),{backdrop_path:l,hero_title_baked_in:p}=a,u=p===void 0?null:p?1:0;return await t.DB.prepare("UPDATE works SET hero_backdrop_path = ?, hero_title_baked_in = COALESCE(?, hero_title_baked_in) WHERE tmdb_id = ?").bind(l||null,u,s).run(),new Response(JSON.stringify({ok:!0}),{headers:e})}catch(s){return new Response(JSON.stringify({ok:!1,message:s.message}),{status:500,headers:e})}}if(r.match(/^\/admin\/works\/\d+\/hero-upload$/)&&i.method==="PUT"){if(!N(i,t))return new Response(JSON.stringify({ok:!1,message:"Unauthorized"}),{status:401,headers:e});try{let s=parseInt(r.split("/")[3]),a=i.headers.get("Content-Type")||"image/jpeg",p={"image/jpeg":"jpg","image/png":"png","image/webp":"webp"}[a]||"jpg",u=`hero/${s}-${Date.now()}.${p}`;await t.IMAGES.put(u,i.body,{httpMetadata:{contentType:a}});let g=`https://img.ottrank.kr/${u}`,E=new URL(i.url).searchParams.get("baked_in")!=="0";return await t.DB.prepare("UPDATE works SET hero_custom_image_url = ?, hero_title_baked_in = ? WHERE tmdb_id = ?").bind(g,E?1:0,s).run(),new Response(JSON.stringify({ok:!0,url:g}),{headers:e})}catch(s){return new Response(JSON.stringify({ok:!1,message:s.message}),{status:500,headers:e})}}if(r.match(/^\/admin\/works\/\d+\/hero-upload$/)&&i.method==="DELETE"){if(!N(i,t))return new Response(JSON.stringify({ok:!1,message:"Unauthorized"}),{status:401,headers:e});try{let s=parseInt(r.split("/")[3]),a=await t.DB.prepare("SELECT hero_custom_image_url FROM works WHERE tmdb_id = ?").bind(s).first();if(a?.hero_custom_image_url){let l=a.hero_custom_image_url.replace("https://img.ottrank.kr/","");try{await t.IMAGES.delete(l)}catch{}}return await t.DB.prepare("UPDATE works SET hero_custom_image_url = NULL WHERE tmdb_id = ?").bind(s).run(),new Response(JSON.stringify({ok:!0}),{headers:e})}catch(s){return new Response(JSON.stringify({ok:!1,message:s.message}),{status:500,headers:e})}}if(r.match(/^\/admin\/works\/\d+\/adult-flag$/)&&i.method==="PATCH"){if(!N(i,t))return new Response(JSON.stringify({ok:!1,message:"Unauthorized"}),{status:401,headers:e});try{let s=parseInt(r.split("/")[3]),l=(await i.json()).adult_flag===1?1:null;return await t.DB.prepare("UPDATE works SET adult_flag = ? WHERE tmdb_id = ?").bind(l,s).run(),new Response(JSON.stringify({ok:!0,adult_flag:l}),{headers:e})}catch(s){return new Response(JSON.stringify({ok:!1,message:s.message}),{status:500,headers:e})}}if(r.match(/^\/admin\/works\/\d+$/)&&i.method==="DELETE"){if(!N(i,t))return new Response(JSON.stringify({ok:!1,message:"Unauthorized"}),{status:401,headers:e});try{let s=parseInt(r.split("/")[3]),a=await t.DB.prepare("SELECT * FROM works WHERE tmdb_id = ?").bind(s).first();return await t.DB.prepare("DELETE FROM works WHERE tmdb_id = ?").bind(s).run(),await t.DB.prepare("INSERT INTO admin_logs (action, target_id, before_value) VALUES ('works_delete', ?, ?)").bind(String(s),JSON.stringify(a)).run(),new Response(JSON.stringify({ok:!0}),{headers:e})}catch(s){return new Response(JSON.stringify({ok:!1,message:s.message}),{status:500,headers:e})}}if(r==="/admin/new-match-count"&&i.method==="GET"){if(!N(i,t))return new Response(JSON.stringify({ok:!1,message:"Unauthorized"}),{status:401,headers:e});try{let s=f.searchParams.get("date")||new Date().toISOString().slice(0,10),a=await t.DB.prepare("SELECT COUNT(*) as count FROM works WHERE first_matched_date = ? AND match_source IN ('auto_claude','auto_tmdb')").bind(s).first();return new Response(JSON.stringify({ok:!0,count:a?.count||0,date:s}),{headers:e})}catch(s){return new Response(JSON.stringify({ok:!1,message:s.message}),{status:500,headers:e})}}if(r==="/admin/manual-rankings"&&i.method==="GET"){if(!N(i,t))return new Response(JSON.stringify({ok:!1,message:"Unauthorized"}),{status:401,headers:e});try{let s=f.searchParams.get("platform"),a=f.searchParams.get("category_slot");if(!s||!a)return new Response(JSON.stringify({ok:!1,message:"platform, category_slot required"}),{status:400,headers:e});let{results:l}=await t.DB.prepare(`
        SELECT id, rank, title_ko, title_en, tmdb_id, poster_path,
               genre, overview, release_year, tmdb_rating, source_name, memo, season
        FROM rankings
        WHERE date = 'manual' AND platform = ? AND category_slot = ?
        ORDER BY rank ASC
      `).bind(s,a).all();return new Response(JSON.stringify({ok:!0,data:l}),{headers:e})}catch(s){return new Response(JSON.stringify({ok:!1,message:s.message}),{status:500,headers:e})}}if(r==="/admin/manual-rankings"&&i.method==="POST"){if(!N(i,t))return new Response(JSON.stringify({ok:!1,message:"Unauthorized"}),{status:401,headers:e});try{let s=await i.json(),{platform:a,category_slot:l,source_name:p,tmdb_id:u,rank:g,memo:m}=s,E=s.season!==void 0?s.season:null;if(!a||!l||!u||!g)return new Response(JSON.stringify({ok:!1,message:"platform, category_slot, tmdb_id, rank required"}),{status:400,headers:e});let w=s.title_ko||"",y=s.title_en||"",k=s.poster_path||null,S=s.genre||null,R=s.overview||null,b=s.release_year||null,T=s.tmdb_rating??null,D=s.media_type==="tv"||s.media_type==="movie"?s.media_type:null;if(!w||!k||!y){let h=await t.DB.prepare("SELECT * FROM works WHERE tmdb_id = ?").bind(parseInt(u)).first();h&&(w=w||h.title_ko||"",y=y||h.title_en||"",k=k||h.poster_path||null,S=S||h.genre||null,R=R||h.overview||null,b=b||h.release_year||null,T=T??h.tmdb_rating??null)}if(!y)try{let h=D?[D]:["tv","movie"];for(let C of h){let I=await fetch(`https://api.themoviedb.org/3/${C}/${u}?language=en-US&api_key=${t.TMDB_API_KEY}`);if(!I.ok)continue;let J=await I.json();if(!J.name&&!J.title)continue;let B=J.original_title||J.original_name||"",H=J.title||J.name||"";y=/[\uAC00-\uD7A3]/.test(B)?H:B||H;break}}catch{}await t.DB.prepare(`
        INSERT INTO rankings
          (date, platform, category, category_slot, source_name, rank,
           title_ko, title_en, tmdb_id, poster_path,
           genre, overview, release_year, tmdb_rating, is_manual, memo, season)
        VALUES ('manual', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)
        ON CONFLICT(date, platform, category, rank) DO UPDATE SET
          tmdb_id      = excluded.tmdb_id,
          title_ko     = excluded.title_ko,
          title_en     = excluded.title_en,
          poster_path  = excluded.poster_path,
          genre        = excluded.genre,
          overview     = excluded.overview,
          release_year = excluded.release_year,
          tmdb_rating  = excluded.tmdb_rating,
          source_name  = excluded.source_name,
          category_slot = excluded.category_slot,
          is_manual    = 1,
          memo         = excluded.memo,
          season       = excluded.season
      `).bind(a,l,l,p||"",parseInt(g),w,y,parseInt(u),k,S,R,b,T,m||null,E!==null?parseInt(E):null).run();let O=new Date().toISOString();return await t.DB.prepare(`
        INSERT INTO works (tmdb_id, title_ko, title_en, poster_path, tmdb_rating, rating_updated_at)
        VALUES (?, ?, ?, ?, ?, ?)
        ON CONFLICT(tmdb_id) DO UPDATE SET
          title_en          = CASE
            WHEN excluded.title_en IS NULL OR excluded.title_en = '' THEN works.title_en
            ELSE COALESCE(NULLIF(works.title_en, ''), excluded.title_en)
          END,
          tmdb_rating       = COALESCE(excluded.tmdb_rating, works.tmdb_rating),
          rating_updated_at = excluded.rating_updated_at,
          updated_at        = datetime('now')
      `).bind(parseInt(u),w||"",y||"",k,T,O).run(),await t.DB.prepare("INSERT INTO admin_logs (action, platform, category_slot, target_id, after_value) VALUES ('manual_ranking_add', ?, ?, ?, ?)").bind(a,l,String(u),JSON.stringify({rank:g,title_ko:w,title_en:y,memo:m})).run(),new Response(JSON.stringify({ok:!0,data:{title_ko:w,title_en:y,poster_path:k,genre:S,release_year:b,tmdb_rating:T}}),{headers:e})}catch(s){return new Response(JSON.stringify({ok:!1,message:s.message}),{status:500,headers:e})}}if(r==="/admin/manual-rankings/reorder"&&i.method==="PATCH"){if(!N(i,t))return new Response(JSON.stringify({ok:!1,message:"Unauthorized"}),{status:401,headers:e});try{let s=await i.json(),{platform:a,category_slot:l,items:p}=s;if(!a||!l||!Array.isArray(p))return new Response(JSON.stringify({ok:!1,message:"platform, category_slot, items required"}),{status:400,headers:e});let u=p.map(m=>t.DB.prepare("UPDATE rankings SET rank = ? WHERE id = ? AND date = 'manual'").bind(-parseInt(m.rank),parseInt(m.id)));await t.DB.batch(u);let g=p.map(m=>t.DB.prepare("UPDATE rankings SET rank = ?, memo = ?, season = ? WHERE id = ? AND date = 'manual'").bind(parseInt(m.rank),m.memo??null,m.season!==void 0&&m.season!==null?parseInt(m.season):null,parseInt(m.id)));return await t.DB.batch(g),await t.DB.prepare("INSERT INTO admin_logs (action, platform, category_slot, after_value) VALUES ('manual_ranking_reorder', ?, ?, ?)").bind(a,l,JSON.stringify(p)).run(),new Response(JSON.stringify({ok:!0}),{headers:e})}catch(s){return new Response(JSON.stringify({ok:!1,message:s.message}),{status:500,headers:e})}}if(r.match(/^\/admin\/manual-rankings\/\d+$/)&&i.method==="DELETE"){if(!N(i,t))return new Response(JSON.stringify({ok:!1,message:"Unauthorized"}),{status:401,headers:e});try{let s=parseInt(r.split("/")[3]),a=await t.DB.prepare("SELECT * FROM rankings WHERE id = ? AND date = 'manual'").bind(s).first();return a?(await t.DB.prepare("DELETE FROM rankings WHERE id = ? AND date = 'manual'").bind(s).run(),await t.DB.prepare("INSERT INTO admin_logs (action, platform, category_slot, target_id, before_value) VALUES ('manual_ranking_delete', ?, ?, ?, ?)").bind(a.platform,a.category_slot,String(a.tmdb_id),JSON.stringify({rank:a.rank,title_ko:a.title_ko,memo:a.memo})).run(),new Response(JSON.stringify({ok:!0}),{headers:e})):new Response(JSON.stringify({ok:!1,message:"Not found or not a manual ranking"}),{status:404,headers:e})}catch(s){return new Response(JSON.stringify({ok:!1,message:s.message}),{status:500,headers:e})}}if(r==="/admin/rankings/reorder"&&i.method==="PATCH"){if(!N(i,t))return new Response(JSON.stringify({ok:!1,message:"Unauthorized"}),{status:401,headers:e});try{let s=await i.json(),{date:a,platform:l,category_slot:p,items:u}=s;if(!a||!l||!p||!Array.isArray(u))return new Response(JSON.stringify({ok:!1,message:"date, platform, category_slot, items required"}),{status:400,headers:e});let g=u.map(E=>t.DB.prepare("UPDATE rankings SET rank = ? WHERE id = ? AND date = ? AND platform = ? AND category_slot = ?").bind(-parseInt(E.rank),parseInt(E.id),a,l,p));await t.DB.batch(g);let m=u.map(E=>t.DB.prepare("UPDATE rankings SET rank = ? WHERE id = ? AND date = ? AND platform = ? AND category_slot = ?").bind(parseInt(E.rank),parseInt(E.id),a,l,p));return await t.DB.batch(m),await t.DB.prepare("INSERT INTO admin_logs (action, platform, category_slot, after_value) VALUES ('ranking_reorder', ?, ?, ?)").bind(l,p,JSON.stringify(u)).run(),new Response(JSON.stringify({ok:!0}),{headers:e})}catch(s){return new Response(JSON.stringify({ok:!1,message:s.message}),{status:500,headers:e})}}if(r==="/admin/sync-ratings"&&i.method==="PATCH"){if(!N(i,t))return new Response(JSON.stringify({ok:!1,message:"Unauthorized"}),{status:401,headers:e});try{let{results:s}=await t.DB.prepare(`
        SELECT r.id, r.tmdb_id
        FROM rankings r
        JOIN works w ON r.tmdb_id = w.tmdb_id
        WHERE r.tmdb_rating IS NULL AND r.tmdb_id IS NOT NULL AND w.tmdb_rating IS NOT NULL
        LIMIT 500
      `).all();if(!s.length)return new Response(JSON.stringify({ok:!0,updated:0,message:"\uB3D9\uAE30\uD654\uD560 \uB370\uC774\uD130 \uC5C6\uC74C"}),{headers:e});let a=s.map(l=>t.DB.prepare("UPDATE rankings SET tmdb_rating = (SELECT tmdb_rating FROM works WHERE tmdb_id = ?) WHERE id = ?").bind(l.tmdb_id,l.id));return await t.DB.batch(a),new Response(JSON.stringify({ok:!0,updated:s.length}),{headers:e})}catch(s){return new Response(JSON.stringify({ok:!1,message:s.message}),{status:500,headers:e})}}if(r.startsWith("/admin/works/")&&r.endsWith("/rating-status")&&i.method==="GET"){if(!N(i,t))return new Response(JSON.stringify({ok:!1,message:"Unauthorized"}),{status:401,headers:e});try{let s=parseInt(r.split("/admin/works/")[1].split("/rating-status")[0]);if(!s)return new Response(JSON.stringify({ok:!1,message:"tmdb_id required"}),{status:400,headers:e});let a=await t.DB.prepare("SELECT tmdb_id, title_ko, title_en, tmdb_rating, rating_updated_at FROM works WHERE tmdb_id = ?").bind(s).first();if(!a)return new Response(JSON.stringify({ok:!1,message:"works\uC5D0 \uC5C6\uB294 \uC791\uD488\uC785\uB2C8\uB2E4"}),{status:404,headers:e});let{results:l}=await t.DB.prepare(`
        SELECT id, platform, category_slot, date, tmdb_rating
        FROM rankings
        WHERE tmdb_id = ?
        ORDER BY date DESC, platform ASC
        LIMIT 50
      `).bind(s).all();return new Response(JSON.stringify({ok:!0,works:{tmdb_id:a.tmdb_id,title_ko:a.title_ko,title_en:a.title_en,tmdb_rating:a.tmdb_rating,rating_updated_at:a.rating_updated_at},rankings:l}),{headers:e})}catch(s){return new Response(JSON.stringify({ok:!1,message:s.message}),{status:500,headers:e})}}if(r==="/admin/works/sync-rating-single"&&i.method==="POST"){if(!N(i,t))return new Response(JSON.stringify({ok:!1,message:"Unauthorized"}),{status:401,headers:e});try{let s=await i.json().catch(()=>({})),a=parseInt(s.tmdb_id),l=!!s.refresh;if(!a)return new Response(JSON.stringify({ok:!1,message:"tmdb_id required"}),{status:400,headers:e});let p=await t.DB.prepare("SELECT tmdb_id, media_type, tmdb_rating FROM works WHERE tmdb_id = ?").bind(a).first();if(!p)return new Response(JSON.stringify({ok:!1,message:"works\uC5D0 \uC5C6\uB294 \uC791\uD488\uC785\uB2C8\uB2E4"}),{status:404,headers:e});let u=p.tmdb_rating??null;if(l){let m=p.media_type?[p.media_type]:["tv","movie"],E=!1,w=null,y=null;for(let S of m)try{let R=await fetch(`https://api.themoviedb.org/3/${S}/${a}?api_key=${t.TMDB_API_KEY}`);if(!R.ok)continue;let b=await R.json();E=!0,w=b.vote_average??null,y=b.release_date||b.first_air_date||null;break}catch{}if(!E)return new Response(JSON.stringify({ok:!1,message:"TMDB \uC870\uD68C \uC2E4\uD328 \u2014 \uC7A0\uC2DC \uD6C4 \uB2E4\uC2DC \uC2DC\uB3C4\uD574\uC8FC\uC138\uC694"}),{status:502,headers:e});let k=new Date().toISOString();await t.DB.prepare("UPDATE works SET tmdb_rating = ?, release_date = ?, rating_updated_at = ? WHERE tmdb_id = ?").bind(w,y,k,a).run(),u=w}let g=await t.DB.prepare("UPDATE rankings SET tmdb_rating = ? WHERE tmdb_id = ?").bind(u,a).run();return new Response(JSON.stringify({ok:!0,tmdb_rating:u,rankings_updated:g.meta?.changes??0}),{headers:e})}catch(s){return new Response(JSON.stringify({ok:!1,message:s.message}),{status:500,headers:e})}}if(r==="/admin/rankings/rating-check"&&i.method==="GET"){if(!N(i,t))return new Response(JSON.stringify({ok:!1,message:"Unauthorized"}),{status:401,headers:e});try{let s=f.searchParams.get("platform"),a=f.searchParams.get("category_slot");if(!s||!a)return new Response(JSON.stringify({ok:!1,message:"platform, category_slot required"}),{status:400,headers:e});let{results:l}=await t.DB.prepare(`
        SELECT r.tmdb_id, r.rank, r.title_ko,
               r.tmdb_rating   AS rankings_rating,
               w.tmdb_rating   AS works_rating,
               w.rating_updated_at
        FROM rankings r
        LEFT JOIN works w ON r.tmdb_id = w.tmdb_id
        WHERE r.platform = ? AND r.category_slot = ?
          AND r.date = (SELECT value FROM app_settings WHERE key = 'latest_ranking_date')
        ORDER BY r.rank ASC
      `).bind(s,a).all();return new Response(JSON.stringify({ok:!0,data:l}),{headers:e})}catch(s){return new Response(JSON.stringify({ok:!1,message:s.message}),{status:500,headers:e})}}if(r==="/admin/works/collect-keywords"&&i.method==="POST"){if(!N(i,t))return new Response(JSON.stringify({ok:!1,message:"Unauthorized"}),{status:401,headers:e});try{let s=await i.json().catch(()=>({})),a=Math.min(parseInt(s.limit)||20,50),{results:l}=await t.DB.prepare(`
        SELECT tmdb_id, media_type FROM works
        WHERE (keywords IS NULL OR keywords = '')
        AND (adult_flag IS NULL OR adult_flag != 1)
        LIMIT ?
      `).bind(a).all();if(!l.length)return new Response(JSON.stringify({ok:!0,processed:0,attempted:0,remaining:0,message:"\uC218\uC9D1\uD560 \uC791\uD488 \uC5C6\uC74C"}),{headers:e});let p=0,u=0,g=[];for(let E of l){let w=E.media_type?[E.media_type]:["tv","movie"],y="",k=!1;for(let S of w)try{let R=await fetch(`https://api.themoviedb.org/3/${S}/${E.tmdb_id}/keywords?api_key=${t.TMDB_API_KEY}`);if(!R.ok)continue;k=!0;let b=await R.json(),T=b.keywords||b.results||[];if(T.length){y=T.map(D=>D.name).filter(Boolean).join(",");break}}catch{}y?(g.push(t.DB.prepare("UPDATE works SET keywords = ? WHERE tmdb_id = ?").bind(y,E.tmdb_id)),p++):k?g.push(t.DB.prepare("UPDATE works SET keywords = ? WHERE tmdb_id = ?").bind("__NONE__",E.tmdb_id)):u++}g.length&&await t.DB.batch(g);let m=await t.DB.prepare("SELECT COUNT(*) as cnt FROM works WHERE (keywords IS NULL OR keywords = '') AND (adult_flag IS NULL OR adult_flag != 1)").first();return new Response(JSON.stringify({ok:!0,processed:p,attempted:l.length,skippedRetry:u,remaining:m?.cnt||0}),{headers:e})}catch(s){return new Response(JSON.stringify({ok:!1,message:s.message}),{status:500,headers:e})}}if(r==="/admin/works/collect-ott"&&i.method==="POST"){if(!N(i,t))return new Response(JSON.stringify({ok:!1,message:"Unauthorized"}),{status:401,headers:e});try{let s=await i.json().catch(()=>({})),a=Math.min(parseInt(s.limit)||30,30),l=15,{results:p}=await t.DB.prepare(`
        SELECT tmdb_id, media_type FROM works
        WHERE (ott_updated_at IS NULL OR ott_updated_at < datetime('now', '-${l} days'))
        LIMIT ?
      `).bind(a).all();if(!p.length)return new Response(JSON.stringify({ok:!0,processed:0,attempted:0,remaining:0,message:"\uC218\uC9D1\uD560 \uC791\uD488 \uC5C6\uC74C"}),{headers:e});let u=p.map(O=>O.tmdb_id),g=u.map(()=>"?").join(","),{results:m}=await t.DB.prepare(`
        SELECT tmdb_id, platform FROM rankings
        WHERE tmdb_id IN (${g})
          AND date = (SELECT value FROM app_settings WHERE key = 'latest_ranking_date')
      `).bind(...u).all(),E={};m.forEach(O=>{(E[O.tmdb_id]||=new Set).add(O.platform)});let{results:w}=await t.DB.prepare(`
        SELECT tmdb_id, ott_key, action FROM work_ott_overrides
        WHERE tmdb_id IN (${g})
      `).bind(...u).all(),y={};w.forEach(O=>{(y[O.tmdb_id]||=[]).push(O)});let k=[[/netflix/i,"netflix"],[/tving/i,"tving"],[/disney/i,"disney"],[/coupang/i,"coupang"],[/wavve/i,"wavve"],[/watcha/i,"watcha"]],S=0,R=0,b=[],T=[];for(let O of p){let h=O.tmdb_id,C=O.media_type==="movie"?"movie":"tv",I=new Set(E[h]||[]),J=!1;try{if(C==="tv"&&!I.has("coupang")){let H=await fetch(`https://api.themoviedb.org/3/tv/${h}?api_key=${t.TMDB_API_KEY}`);H.ok&&(J=!0,((await H.json()).networks||[]).some(M=>M.id===5169)&&I.add("coupang"))}let B=await fetch(`https://api.themoviedb.org/3/${C}/${h}/watch/providers?api_key=${t.TMDB_API_KEY}`);if(B.ok){J=!0;let H=await B.json();(H.results&&H.results.KR&&H.results.KR.flatrate||[]).forEach(M=>{let P=k.find(([Y])=>Y.test(M.provider_name||""));P&&I.add(P[1])})}}catch{}if(!J&&I.size===0){R++;continue}(y[h]||[]).forEach(B=>{B.action==="add"?I.add(B.ott_key):B.action==="remove"&&I.delete(B.ott_key)}),b.push(t.DB.prepare("DELETE FROM work_ott WHERE tmdb_id = ?").bind(h)),[...I].forEach(B=>{b.push(t.DB.prepare("INSERT INTO work_ott (tmdb_id, ott_key) VALUES (?, ?)").bind(h,B))}),T.push(h),S++}if(T.length){let O=T.map(()=>"?").join(",");b.push(t.DB.prepare(`UPDATE works SET ott_updated_at = datetime('now') WHERE tmdb_id IN (${O})`).bind(...T))}b.length&&await t.DB.batch(b);let D=await t.DB.prepare(`
        SELECT COUNT(*) as cnt FROM works
        WHERE (ott_updated_at IS NULL OR ott_updated_at < datetime('now', '-${l} days'))
      `).first();return new Response(JSON.stringify({ok:!0,processed:S,attempted:p.length,skippedRetry:R,remaining:D?.cnt||0}),{headers:e})}catch(s){return new Response(JSON.stringify({ok:!1,message:s.message}),{status:500,headers:e})}}if(r==="/admin/works/adult-search"&&i.method==="GET"){if(!N(i,t))return new Response(JSON.stringify({ok:!1,message:"Unauthorized"}),{status:401,headers:e});try{let s=Math.min(parseInt(f.searchParams.get("limit"))||50,100),a=(f.searchParams.get("word")||"").trim(),l,p;if(a)l="adult_flag IS NULL AND (title_ko LIKE ? OR title_en LIKE ? OR overview LIKE ? OR keywords LIKE ?)",p=[`%${a}%`,`%${a}%`,`%${a}%`,`%${a}%`];else{let m=["\uC815\uC0AC","\uC57C\uD55C","\uACC4\uBAA8","\uC0C8\uC5C4\uB9C8","\uCC98\uC81C","\uD615\uC218","\uB3D9\uC11C","\uC720\uD639","\uBD88\uB95C","\uC678\uB3C4","\uBAB8\uB9E4","\uD558\uB8FB\uBC24"],E=m.map(()=>"(title_ko LIKE ? OR overview LIKE ?)").join(" OR "),w=m.flatMap(R=>[`%${R}%`,`%${R}%`]),y=["softcore","erotica","pinku eiga","sexploitation"],k=y.map(()=>"keywords LIKE ?").join(" OR "),S=y.map(R=>`%${R}%`);l=`adult_flag IS NULL AND (${E} OR ${k})`,p=[...w,...S]}let{results:u}=await t.DB.prepare(`
        SELECT tmdb_id, title_ko, title_en, poster_path, media_type
        FROM works
        WHERE ${l}
        LIMIT ?
      `).bind(...p,s).all(),g=await t.DB.prepare(`
        SELECT COUNT(*) as cnt FROM works WHERE ${l}
      `).bind(...p).first();return new Response(JSON.stringify({ok:!0,items:u,remaining:g?.cnt||0}),{headers:e})}catch(s){return new Response(JSON.stringify({ok:!1,message:s.message}),{status:500,headers:e})}}if(r==="/admin/works/adult-review"&&i.method==="POST"){if(!N(i,t))return new Response(JSON.stringify({ok:!1,message:"Unauthorized"}),{status:401,headers:e});try{let s=await i.json().catch(()=>({})),a=Array.isArray(s.delete_ids)?s.delete_ids.map(Number).filter(Boolean):[],l=Array.isArray(s.clear_ids)?s.clear_ids.map(Number).filter(Boolean):[],p=0,u=0;if(a.length){let g=a.map(m=>t.DB.prepare("DELETE FROM works WHERE tmdb_id = ?").bind(m));await t.DB.batch(g),p=a.length}if(l.length){let g=l.map(m=>t.DB.prepare("UPDATE works SET adult_flag = 0 WHERE tmdb_id = ?").bind(m));await t.DB.batch(g),u=l.length}return new Response(JSON.stringify({ok:!0,deleted:p,cleared:u}),{headers:e})}catch(s){return new Response(JSON.stringify({ok:!1,message:s.message}),{status:500,headers:e})}}if(r==="/admin/works/backfill-normalize-keywords"&&i.method==="POST"){if(!N(i,t))return new Response(JSON.stringify({ok:!1,message:"Unauthorized"}),{status:401,headers:e});try{let s=await i.json().catch(()=>({})),a=Math.min(parseInt(s.limit)||200,300),{results:l}=await t.DB.prepare(`
        SELECT tmdb_id, keywords FROM works
        WHERE keywords_normalized_at IS NULL
          AND keywords IS NOT NULL AND keywords != ''
        LIMIT ?
      `).bind(a).all();if(!l.length)return new Response(JSON.stringify({ok:!0,processed:0,attempted:0,remaining:0,message:"\uC815\uADDC\uD654\uD560 \uC791\uD488 \uC5C6\uC74C"}),{headers:e});let p=[],u=0,g=new Date().toISOString();for(let E of l){if(E.keywords&&E.keywords!=="__NONE__"){let w=new Set(E.keywords.split(",").map(y=>y.trim().toLowerCase()).filter(Boolean));if(w.size){for(let y of w)p.push(t.DB.prepare("INSERT OR IGNORE INTO work_keywords (tmdb_id, keyword) VALUES (?, ?)").bind(E.tmdb_id,y)),p.push(t.DB.prepare("INSERT OR IGNORE INTO keyword_translation (keyword_en) VALUES (?)").bind(y));u++}}p.push(t.DB.prepare("UPDATE works SET keywords_normalized_at = ? WHERE tmdb_id = ?").bind(g,E.tmdb_id))}p.length&&await t.DB.batch(p);let m=await t.DB.prepare(`
        SELECT COUNT(*) as cnt FROM works
        WHERE keywords_normalized_at IS NULL
          AND keywords IS NOT NULL AND keywords != ''
      `).first();return new Response(JSON.stringify({ok:!0,processed:u,attempted:l.length,remaining:m?.cnt||0}),{headers:e})}catch(s){return new Response(JSON.stringify({ok:!1,message:s.message}),{status:500,headers:e})}}if(r==="/admin/keywords/translate"&&i.method==="POST"){if(!N(i,t))return new Response(JSON.stringify({ok:!1,message:"Unauthorized"}),{status:401,headers:e});if(!t.ANTHROPIC_API_KEY)return new Response(JSON.stringify({ok:!1,message:"ANTHROPIC_API_KEY\uAC00 Workers Secrets\uC5D0 \uC124\uC815\uB418\uC5B4 \uC788\uC9C0 \uC54A\uC2B5\uB2C8\uB2E4"}),{status:500,headers:e});try{let s=await i.json().catch(()=>({})),a=Math.min(parseInt(s.limit)||40,60),{results:l}=await t.DB.prepare(`
        SELECT keyword_en FROM keyword_translation
        WHERE source IS NULL
          AND (translate_attempts IS NULL OR translate_attempts < 3)
        LIMIT ?
      `).bind(a).all();if(!l.length)return new Response(JSON.stringify({ok:!0,attempted:0,translated:0,remaining:0,message:"\uBC88\uC5ED\uD560 \uD0A4\uC6CC\uB4DC \uC5C6\uC74C"}),{headers:e});let p=l.map(D=>`- ${D.keyword_en}`).join(`
`),u='\uB108\uB294 TMDB \uC601\uBB38 \uC791\uD488 \uD0A4\uC6CC\uB4DC(\uD14C\uB9C8/\uBD84\uC704\uAE30 \uD0DC\uADF8)\uB97C \uD55C\uAD6D OTT \uC11C\uBE44\uC2A4 \uC0AC\uC6A9\uC790\uC6A9\uC73C\uB85C \uBC88\uC5ED\uD558\uB294 \uB3C4\uC6B0\uBBF8\uB2E4. \uAC01 \uC601\uBB38 \uD0A4\uC6CC\uB4DC\uB97C \uC790\uC5F0\uC2A4\uB7FD\uACE0 \uAC04\uACB0\uD55C \uD55C\uAD6D\uC5B4 \uBA85\uC0AC\uAD6C(\uB300\uB7B5 2~8\uC790)\uB85C \uBC88\uC5ED\uD574\uB77C. \uC9C1\uC5ED\uBCF4\uB2E4 \uD55C\uAD6D \uC2DC\uCCAD\uC790\uC5D0\uAC8C \uC775\uC219\uD55C \uD45C\uD604\uC744 \uC6B0\uC120\uD574\uB77C(\uC608: revenge\u2192\uBCF5\uC218, chaebol\u2192\uC7AC\uBC8C, coming of age\u2192\uC131\uC7A5). \uC124\uBA85\uC774\uB098 \uBD80\uC5F0 \uC5C6\uC774, \uC694\uCCAD\uBC1B\uC740 \uD0A4\uC6CC\uB4DC \uC804\uBD80\uC5D0 \uB300\uD574 1:1\uB85C \uBC88\uC5ED\uD574\uB77C. \uBC18\uB4DC\uC2DC JSON \uBC30\uC5F4\uB9CC \uCD9C\uB825\uD558\uACE0, \uB2E4\uB978 \uC124\uBA85\uC774\uB098 \uCF54\uB4DC\uBE14\uB85D(```)\uC740 \uC808\uB300 \uD3EC\uD568\uD558\uC9C0 \uB9C8\uB77C. \uCD9C\uB825 \uD615\uC2DD: [{"keyword_en":"revenge","keyword_ko":"\uBCF5\uC218"}, ...]',g=`\uBC88\uC5ED\uD560 \uD0A4\uC6CC\uB4DC \uBAA9\uB85D:
${p}`,m=await fetch("https://api.anthropic.com/v1/messages",{method:"POST",headers:{"Content-Type":"application/json","x-api-key":t.ANTHROPIC_API_KEY,"anthropic-version":"2023-06-01"},body:JSON.stringify({model:"claude-haiku-4-5-20251001",max_tokens:3e3,system:u,messages:[{role:"user",content:g}]})});if(!m.ok){let D=await m.text().catch(()=>"");return new Response(JSON.stringify({ok:!1,message:`Claude API \uC624\uB958 (status ${m.status})`,detail:D.slice(0,300)}),{status:502,headers:e})}let w=((await m.json()).content||[]).filter(D=>D.type==="text").map(D=>D.text).join(""),y;try{let D=w.replace(/```json|```/g,"").trim();y=JSON.parse(D)}catch{return new Response(JSON.stringify({ok:!1,message:"Claude \uC751\uB2F5 \uD30C\uC2F1 \uC2E4\uD328 \u2014 \uB2E4\uC2DC \uC2DC\uB3C4\uD574\uC8FC\uC138\uC694",raw:w.slice(0,300)}),{status:502,headers:e})}Array.isArray(y)||(y=[]);let k=new Set(l.map(D=>D.keyword_en)),S=new Map;for(let D of y){let O=(D.keyword_en||"").trim().toLowerCase(),h=(D.keyword_ko||"").trim();!O||!h||!k.has(O)||S.set(O,h)}let R=[],b=0;for(let D of l){if(!S.has(D.keyword_en)){R.push(t.DB.prepare("UPDATE keyword_translation SET translate_attempts = COALESCE(translate_attempts, 0) + 1 WHERE keyword_en = ? AND source IS NULL").bind(D.keyword_en));continue}R.push(t.DB.prepare("UPDATE keyword_translation SET keyword_ko = ?, source = 'auto' WHERE keyword_en = ? AND source IS NULL").bind(S.get(D.keyword_en),D.keyword_en)),b++}R.length&&await t.DB.batch(R);let T=await t.DB.prepare(`
        SELECT
          SUM(CASE WHEN source IS NULL AND (translate_attempts IS NULL OR translate_attempts < 3) THEN 1 ELSE 0 END) AS remaining,
          SUM(CASE WHEN source IS NULL AND translate_attempts >= 3 THEN 1 ELSE 0 END) AS stuck
        FROM keyword_translation
      `).first();return new Response(JSON.stringify({ok:!0,attempted:l.length,translated:b,remaining:T?.remaining||0,stuck:T?.stuck||0}),{headers:e})}catch(s){return new Response(JSON.stringify({ok:!1,message:s.message}),{status:500,headers:e})}}if(r==="/admin/keywords/review"&&i.method==="GET"){if(!N(i,t))return new Response(JSON.stringify({ok:!1,message:"Unauthorized"}),{status:401,headers:e});try{let s=Math.min(parseInt(f.searchParams.get("limit"))||30,60),{results:a}=await t.DB.prepare(`
        SELECT id, keyword_en, keyword_ko
        FROM keyword_translation
        WHERE source = 'auto'
        ORDER BY id ASC
        LIMIT ?
      `).bind(s).all(),l=await t.DB.prepare("SELECT COUNT(*) as cnt FROM keyword_translation WHERE source = 'auto'").first();return new Response(JSON.stringify({ok:!0,items:a,remaining:l?.cnt||0}),{headers:e})}catch(s){return new Response(JSON.stringify({ok:!1,message:s.message}),{status:500,headers:e})}}if(r==="/admin/keywords/review"&&i.method==="POST"){if(!N(i,t))return new Response(JSON.stringify({ok:!1,message:"Unauthorized"}),{status:401,headers:e});try{let s=await i.json().catch(()=>({})),l=(Array.isArray(s.items)?s.items:[]).filter(g=>g&&g.id&&typeof g.keyword_ko=="string"&&g.keyword_ko.trim());if(!l.length)return new Response(JSON.stringify({ok:!1,message:"\uC720\uD6A8\uD55C \uD56D\uBAA9\uC774 \uC5C6\uC5B4\uC694"}),{status:400,headers:e});let p=l.map(g=>t.DB.prepare("UPDATE keyword_translation SET keyword_ko = ?, source = 'admin' WHERE id = ?").bind(g.keyword_ko.trim(),parseInt(g.id)));await t.DB.batch(p);let u=await t.DB.prepare("SELECT COUNT(*) as cnt FROM keyword_translation WHERE source = 'auto'").first();return new Response(JSON.stringify({ok:!0,updated:l.length,remaining:u?.cnt||0}),{headers:e})}catch(s){return new Response(JSON.stringify({ok:!1,message:s.message}),{status:500,headers:e})}}if(r==="/admin/keywords/search"&&i.method==="GET"){if(!N(i,t))return new Response(JSON.stringify({ok:!1,message:"Unauthorized"}),{status:401,headers:e});try{let s=(f.searchParams.get("q")||"").trim();if(!s)return new Response(JSON.stringify({ok:!1,message:"\uAC80\uC0C9\uC5B4(q)\uAC00 \uD544\uC694\uD574\uC694"}),{status:400,headers:e});let a=`%${s}%`,{results:l}=await t.DB.prepare(`
        SELECT id, keyword_en, keyword_ko, keyword_ko_2, keyword_ko_3, source
        FROM keyword_translation
        WHERE keyword_en LIKE ? OR keyword_ko LIKE ?
        ORDER BY keyword_en ASC
        LIMIT 50
      `).bind(a,a).all();return new Response(JSON.stringify({ok:!0,items:l}),{headers:e})}catch(s){return new Response(JSON.stringify({ok:!1,message:s.message}),{status:500,headers:e})}}if(r==="/admin/keywords/update"&&i.method==="POST"){if(!N(i,t))return new Response(JSON.stringify({ok:!1,message:"Unauthorized"}),{status:401,headers:e});try{let s=await i.json().catch(()=>({})),a=(s.keyword_en||"").trim(),l=(s.keyword_ko||"").trim(),p=(s.keyword_ko_2||"").trim()||null,u=(s.keyword_ko_3||"").trim()||null;if(!a||!l)return new Response(JSON.stringify({ok:!1,message:"keyword_en, keyword_ko \uBAA8\uB450 \uD544\uC694\uD574\uC694"}),{status:400,headers:e});let g=await t.DB.prepare("UPDATE keyword_translation SET keyword_ko = ?, keyword_ko_2 = ?, keyword_ko_3 = ?, source = 'admin' WHERE keyword_en = ?").bind(l,p,u,a).run();return!g.meta||g.meta.changes===0?new Response(JSON.stringify({ok:!1,message:"\uD574\uB2F9 keyword_en\uC744 \uCC3E\uC9C0 \uBABB\uD588\uC5B4\uC694"}),{status:404,headers:e}):new Response(JSON.stringify({ok:!0}),{headers:e})}catch(s){return new Response(JSON.stringify({ok:!1,message:s.message}),{status:500,headers:e})}}if(r==="/admin/works/keywords"&&i.method==="GET"){if(!N(i,t))return new Response(JSON.stringify({ok:!1,message:"Unauthorized"}),{status:401,headers:e});try{let s=(f.searchParams.get("q")||"").trim();if(!s)return new Response(JSON.stringify({ok:!1,message:"\uAC80\uC0C9\uC5B4(q)\uAC00 \uD544\uC694\uD574\uC694"}),{status:400,headers:e});let a;if(/^\d+$/.test(s)){let g=await t.DB.prepare("SELECT tmdb_id, title_ko, title_en FROM works WHERE tmdb_id = ?").bind(parseInt(s)).first();a=g?[g]:[]}else{let{results:g}=await t.DB.prepare(`
          SELECT tmdb_id, title_ko, title_en FROM works
          WHERE title_ko LIKE ? OR title_en LIKE ?
          ORDER BY tmdb_rating DESC
          LIMIT 5
        `).bind(`%${s}%`,`%${s}%`).all();a=g}if(!a.length)return new Response(JSON.stringify({ok:!0,works:[],items:[]}),{headers:e});let l=a.map(g=>g.tmdb_id),p=l.map(()=>"?").join(","),{results:u}=await t.DB.prepare(`
        SELECT DISTINCT kt.id, kt.keyword_en, kt.keyword_ko, kt.keyword_ko_2, kt.keyword_ko_3, kt.source
        FROM work_keywords wk
        JOIN keyword_translation kt ON kt.keyword_en = wk.keyword
        WHERE wk.tmdb_id IN (${p})
        ORDER BY kt.keyword_en ASC
      `).bind(...l).all();return new Response(JSON.stringify({ok:!0,works:a,items:u}),{headers:e})}catch(s){return new Response(JSON.stringify({ok:!1,message:s.message}),{status:500,headers:e})}}let d=r.match(/^\/admin\/works\/(\d+)\/reset-keyword-cache$/);if(d&&i.method==="POST"){if(!N(i,t))return new Response(JSON.stringify({ok:!1,message:"Unauthorized"}),{status:401,headers:e});try{let s=parseInt(d[1]),a=await t.DB.prepare("UPDATE works SET keyword_ko_map_updated_at = NULL WHERE tmdb_id = ?").bind(s).run();return!a.meta||a.meta.changes===0?new Response(JSON.stringify({ok:!1,message:"\uD574\uB2F9 tmdb_id\uB97C \uCC3E\uC9C0 \uBABB\uD588\uC5B4\uC694"}),{status:404,headers:e}):new Response(JSON.stringify({ok:!0}),{headers:e})}catch(s){return new Response(JSON.stringify({ok:!1,message:s.message}),{status:500,headers:e})}}if(r==="/admin/works/discover-collect"&&i.method==="POST"){if(!N(i,t))return new Response(JSON.stringify({ok:!1,message:"Unauthorized"}),{status:401,headers:e});try{let s=await i.json().catch(()=>({})),a=s.media_type,l=Math.max(parseInt(s.page)||1,1);if(!["movie","tv"].includes(a))return new Response(JSON.stringify({ok:!1,message:"media_type\uC740 'movie' \uB610\uB294 'tv'\uB9CC \uD5C8\uC6A9"}),{status:400,headers:e});let p=a==="movie"?`https://api.themoviedb.org/3/discover/movie?api_key=${t.TMDB_API_KEY}&language=ko-KR&region=KR&with_original_language=ko&sort_by=popularity.desc&page=${l}`:`https://api.themoviedb.org/3/discover/tv?api_key=${t.TMDB_API_KEY}&language=ko-KR&with_origin_country=KR&sort_by=popularity.desc&page=${l}`,u=await fetch(p);if(!u.ok)return new Response(JSON.stringify({ok:!1,message:`TMDB discover \uC870\uD68C \uC2E4\uD328 (status ${u.status})`}),{status:502,headers:e});let g=await u.json(),m=g.results||[],E=g.total_pages||1;if(!m.length)return new Response(JSON.stringify({ok:!0,attempted:0,inserted:0,skipped:0,hasNextPage:!1,nextPage:l+1,totalPages:E}),{headers:e});let w=m.map(D=>D.id),y=w.map(()=>"?").join(","),{results:k}=await t.DB.prepare(`SELECT tmdb_id FROM works WHERE tmdb_id IN (${y})`).bind(...w).all(),S=new Set((k||[]).map(D=>D.tmdb_id)),R=m.filter(D=>!S.has(D.id)),b=[],T=0;for(let D of R){let O=null,h=null,C=null,I=null,J=null,B=null,H="";try{let F=await fetch(`https://api.themoviedb.org/3/${a}/${D.id}?language=ko-KR&api_key=${t.TMDB_API_KEY}`);if(F.ok){let M=await F.json();O=M.name||M.title||D.name||D.title||null,C=M.poster_path||D.poster_path||null,I=(M.genres||[]).map(P=>P.name).join(", ")||null,J=M.vote_average?parseFloat(M.vote_average.toFixed(1)):null,B=parseInt((M.first_air_date||M.release_date||"").slice(0,4))||null,H=M.overview||D.overview||""}}catch{}if(O){try{let F=await fetch(`https://api.themoviedb.org/3/${a}/${D.id}?language=en-US&api_key=${t.TMDB_API_KEY}`);if(F.ok){let M=await F.json(),P=M.original_title||M.original_name||"",Y=M.title||M.name||"";h=/[\uAC00-\uD7A3]/.test(P)?Y:P||Y}}catch{}b.push(t.DB.prepare(`
            INSERT INTO works
              (tmdb_id, title_ko, title_en, overview, genre, release_year,
               tmdb_rating, poster_path, media_type, match_source, confidence_score, first_matched_date)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'auto_discover', 90, date('now'))
            ON CONFLICT(tmdb_id) DO NOTHING
          `).bind(D.id,O,h||"",H||"",I||"",B,J,C,a)),T++}}return b.length&&await t.DB.batch(b),new Response(JSON.stringify({ok:!0,attempted:m.length,inserted:T,skipped:m.length-R.length,hasNextPage:l<E,nextPage:l+1,totalPages:E}),{headers:e})}catch(s){return new Response(JSON.stringify({ok:!1,message:s.message}),{status:500,headers:e})}}if(r==="/admin/works/classify-variety"&&i.method==="POST"){if(!N(i,t))return new Response(JSON.stringify({ok:!1,message:"Unauthorized"}),{status:401,headers:e});if(!t.ANTHROPIC_API_KEY)return new Response(JSON.stringify({ok:!1,message:"ANTHROPIC_API_KEY\uAC00 Workers Secrets\uC5D0 \uC124\uC815\uB418\uC5B4 \uC788\uC9C0 \uC54A\uC2B5\uB2C8\uB2E4"}),{status:500,headers:e});try{let s=await i.json().catch(()=>({})),a=Math.min(parseInt(s.limit)||10,15),{results:l}=await t.DB.prepare("SELECT label FROM variety_genre_options ORDER BY sort_order ASC").all();if(!l.length)return new Response(JSON.stringify({ok:!1,message:"variety_genre_options\uC5D0 \uD0DC\uADF8\uAC00 \uD558\uB098\uB3C4 \uC5C6\uC2B5\uB2C8\uB2E4. \uBA3C\uC800 \uD0DC\uADF8\uB97C \uB4F1\uB85D\uD574\uC8FC\uC138\uC694."}),{status:400,headers:e});let p=l.map(h=>h.label),{results:u}=await t.DB.prepare(`
        SELECT tmdb_id, title_ko, overview, genre
        FROM works
        WHERE original_language = 'ko'
          AND variety_genre_source IS NULL
          AND (
            genre LIKE '%Reality%' OR genre LIKE '%Talk%' OR
            genre LIKE '%\uB2E4\uD050\uBA58\uD130\uB9AC%' OR genre LIKE '%\uB9AC\uC5BC\uB9AC\uD2F0%' OR genre LIKE '%\uD1A0\uD06C%'
          )
        LIMIT ?
      `).bind(a).all();if(!u.length)return new Response(JSON.stringify({ok:!0,attempted:0,classified:0,remaining:0,message:"\uBD84\uB958\uD560 \uC791\uD488 \uC5C6\uC74C"}),{headers:e});let g=u.map(h=>`- tmdb_id:${h.tmdb_id} / \uC81C\uBAA9:"${h.title_ko||""}" / \uC904\uAC70\uB9AC:"${(h.overview||"").slice(0,200)}"`).join(`
`),m='\uB108\uB294 \uD55C\uAD6D \uC608\uB2A5 \uD504\uB85C\uADF8\uB7A8\uC744 \uBD84\uB958\uD558\uB294 \uB3C4\uC6B0\uBBF8\uB2E4. \uC544\uB798 \uD0DC\uADF8 \uBAA9\uB85D \uC911\uC5D0\uC11C\uB9CC \uACE8\uB77C\uC57C \uD558\uBA70, \uBAA9\uB85D\uC5D0 \uC5C6\uB294 \uD0DC\uADF8\uB294 \uC808\uB300 \uB9CC\uB4E4\uC5B4\uB0B4\uC9C0 \uB9C8\uB77C. \uAC01 \uC791\uD488\uB9C8\uB2E4 \uAC00\uC7A5 \uC5B4\uC6B8\uB9AC\uB294 \uD0DC\uADF8\uB97C \uCD5C\uB300 2\uAC1C\uAE4C\uC9C0 \uACE0\uB974\uACE0, \uC560\uB9E4\uD558\uBA74 1\uAC1C\uB9CC \uACE0\uB974\uAC70\uB098 "\uC77C\uBC18 \uC608\uB2A5"\uC744 \uC120\uD0DD\uD574\uB77C. \uC608\uB2A5\uC774 \uC544\uB2C8\uB77C\uACE0 \uD310\uB2E8\uB418\uBA74(\uB4DC\uB77C\uB9C8/\uC601\uD654/\uB2E4\uD050 \uB4F1) tags\uB97C \uBE48 \uBC30\uC5F4\uB85C \uB0A8\uACA8\uB77C. \uBC18\uB4DC\uC2DC JSON \uBC30\uC5F4\uB9CC \uCD9C\uB825\uD558\uACE0, \uB2E4\uB978 \uC124\uBA85\uC774\uB098 \uCF54\uB4DC\uBE14\uB85D(```)\uC740 \uC808\uB300 \uD3EC\uD568\uD558\uC9C0 \uB9C8\uB77C. \uCD9C\uB825 \uD615\uC2DD: [{"tmdb_id":123,"tags":["\uC5EC\uD589 \uC608\uB2A5"]}, ...]',E=`\uD0DC\uADF8 \uBAA9\uB85D: ${p.join(", ")}

\uC791\uD488 \uBAA9\uB85D:
${g}`,w=await fetch("https://api.anthropic.com/v1/messages",{method:"POST",headers:{"Content-Type":"application/json","x-api-key":t.ANTHROPIC_API_KEY,"anthropic-version":"2023-06-01"},body:JSON.stringify({model:"claude-haiku-4-5-20251001",max_tokens:2e3,system:m,messages:[{role:"user",content:E}]})});if(!w.ok){let h=await w.text().catch(()=>"");return new Response(JSON.stringify({ok:!1,message:`Claude API \uC624\uB958 (status ${w.status})`,detail:h.slice(0,300)}),{status:502,headers:e})}let k=((await w.json()).content||[]).filter(h=>h.type==="text").map(h=>h.text).join(""),S;try{let h=k.replace(/```json|```/g,"").trim();S=JSON.parse(h)}catch{return new Response(JSON.stringify({ok:!1,message:"Claude \uC751\uB2F5 \uD30C\uC2F1 \uC2E4\uD328 \u2014 \uB2E4\uC2DC \uC2DC\uB3C4\uD574\uC8FC\uC138\uC694",raw:k.slice(0,300)}),{status:502,headers:e})}Array.isArray(S)||(S=[]);let R=new Set(p),b=new Map;for(let h of S){let C=parseInt(h.tmdb_id);if(!C)continue;let I=Array.isArray(h.tags)?h.tags.filter(J=>R.has(J)).slice(0,2):[];b.set(C,I)}let T=[],D=0;for(let h of u){if(!b.has(h.tmdb_id))continue;let C=b.get(h.tmdb_id);T.push(t.DB.prepare("UPDATE works SET variety_genre = ?, variety_genre_source = 'auto' WHERE tmdb_id = ?").bind(C.length?C.join(","):null,h.tmdb_id)),D++}T.length&&await t.DB.batch(T);let O=await t.DB.prepare(`
        SELECT COUNT(*) as cnt FROM works
        WHERE original_language = 'ko' AND variety_genre_source IS NULL
          AND (genre LIKE '%Reality%' OR genre LIKE '%Talk%' OR genre LIKE '%\uB2E4\uD050\uBA58\uD130\uB9AC%' OR genre LIKE '%\uB9AC\uC5BC\uB9AC\uD2F0%' OR genre LIKE '%\uD1A0\uD06C%')
      `).first();return new Response(JSON.stringify({ok:!0,attempted:u.length,classified:D,remaining:O?.cnt||0}),{headers:e})}catch(s){return new Response(JSON.stringify({ok:!1,message:s.message}),{status:500,headers:e})}}if(r==="/admin/variety-genre-options"&&i.method==="GET"){if(!N(i,t))return new Response(JSON.stringify({ok:!1,message:"Unauthorized"}),{status:401,headers:e});try{let{results:s}=await t.DB.prepare("SELECT id, label, sort_order FROM variety_genre_options ORDER BY sort_order ASC").all();return new Response(JSON.stringify({ok:!0,data:s}),{headers:e})}catch(s){return new Response(JSON.stringify({ok:!1,message:s.message}),{status:500,headers:e})}}if(r==="/admin/works/variety-review"&&i.method==="GET"){if(!N(i,t))return new Response(JSON.stringify({ok:!1,message:"Unauthorized"}),{status:401,headers:e});try{let s=Math.min(parseInt(f.searchParams.get("limit"))||12,30),{results:a}=await t.DB.prepare(`
        SELECT tmdb_id, title_ko, poster_path, variety_genre, media_type
        FROM works
        WHERE variety_genre_source = 'auto'
        ORDER BY (variety_review_skipped_at IS NULL) DESC, variety_review_skipped_at ASC, tmdb_id ASC
        LIMIT ?
      `).bind(s).all(),l=await t.DB.prepare("SELECT COUNT(*) as cnt FROM works WHERE variety_genre_source = 'auto'").first();return new Response(JSON.stringify({ok:!0,items:a,remaining:l?.cnt||0}),{headers:e})}catch(s){return new Response(JSON.stringify({ok:!1,message:s.message}),{status:500,headers:e})}}if(r==="/admin/works/variety-review"&&i.method==="POST"){if(!N(i,t))return new Response(JSON.stringify({ok:!1,message:"Unauthorized"}),{status:401,headers:e});try{let s=await i.json().catch(()=>({})),l=(Array.isArray(s.items)?s.items:[]).filter(g=>g&&g.tmdb_id&&Array.isArray(g.tags));if(!l.length)return new Response(JSON.stringify({ok:!1,message:"\uC720\uD6A8\uD55C \uD56D\uBAA9\uC774 \uC5C6\uC5B4\uC694"}),{status:400,headers:e});let p=l.map(g=>{let m=g.tags.filter(Boolean).slice(0,2);return t.DB.prepare("UPDATE works SET variety_genre = ?, variety_genre_source = 'admin' WHERE tmdb_id = ?").bind(m.length?m.join(","):null,parseInt(g.tmdb_id))});await t.DB.batch(p);let u=await t.DB.prepare("SELECT COUNT(*) as cnt FROM works WHERE variety_genre_source = 'auto'").first();return new Response(JSON.stringify({ok:!0,updated:l.length,remaining:u?.cnt||0}),{headers:e})}catch(s){return new Response(JSON.stringify({ok:!1,message:s.message}),{status:500,headers:e})}}if(r==="/admin/works/variety-review/skip"&&i.method==="POST"){if(!N(i,t))return new Response(JSON.stringify({ok:!1,message:"Unauthorized"}),{status:401,headers:e});try{let s=await i.json().catch(()=>({})),a=Array.isArray(s.tmdb_ids)?s.tmdb_ids.map(u=>parseInt(u)).filter(u=>Number.isInteger(u)):[];if(!a.length)return new Response(JSON.stringify({ok:!1,message:"tmdb_ids required"}),{status:400,headers:e});let l=new Date().toISOString(),p=a.map(u=>t.DB.prepare("UPDATE works SET variety_review_skipped_at = ? WHERE tmdb_id = ?").bind(l,u));return await t.DB.batch(p),new Response(JSON.stringify({ok:!0,skipped:a.length}),{headers:e})}catch(s){return new Response(JSON.stringify({ok:!1,message:s.message}),{status:500,headers:e})}}if(r==="/admin/works/pinned-similar"&&i.method==="POST"){if(!N(i,t))return new Response(JSON.stringify({ok:!1,message:"Unauthorized"}),{status:401,headers:e});try{let s=await i.json().catch(()=>({})),a=parseInt(s.tmdb_id),l=parseInt(s.related_tmdb_id),p=parseInt(s.pinned_pct);if((!p||p<1||p>99)&&(p=99),!a||!l)return new Response(JSON.stringify({ok:!1,message:"\uB450 \uC791\uD488\uC758 tmdb_id\uAC00 \uBAA8\uB450 \uD544\uC694\uD569\uB2C8\uB2E4"}),{status:400,headers:e});if(a===l)return new Response(JSON.stringify({ok:!1,message:"\uAC19\uC740 \uC791\uD488\uB07C\uB9AC\uB294 \uC5F0\uACB0\uD560 \uC218 \uC5C6\uC5B4\uC694"}),{status:400,headers:e});let{results:u}=await t.DB.prepare("SELECT tmdb_id FROM works WHERE tmdb_id IN (?, ?)").bind(a,l).all();return u.length<2?new Response(JSON.stringify({ok:!1,message:"works \uD14C\uC774\uBE14\uC5D0 \uC5C6\uB294 \uC791\uD488\uC774 \uD3EC\uD568\uB418\uC5B4 \uC788\uC5B4\uC694"}),{status:400,headers:e}):(await t.DB.batch([t.DB.prepare(`
          INSERT INTO work_pinned_similar (tmdb_id, related_tmdb_id, pinned_pct)
          VALUES (?, ?, ?)
          ON CONFLICT(tmdb_id, related_tmdb_id) DO UPDATE SET pinned_pct = excluded.pinned_pct
        `).bind(a,l,p),t.DB.prepare(`
          INSERT INTO work_pinned_similar (tmdb_id, related_tmdb_id, pinned_pct)
          VALUES (?, ?, ?)
          ON CONFLICT(tmdb_id, related_tmdb_id) DO UPDATE SET pinned_pct = excluded.pinned_pct
        `).bind(l,a,p)]),new Response(JSON.stringify({ok:!0,pinned_pct:p}),{headers:e}))}catch(s){return new Response(JSON.stringify({ok:!1,message:s.message}),{status:500,headers:e})}}if(r.startsWith("/admin/works/pinned-similar/")&&i.method==="GET"){if(!N(i,t))return new Response(JSON.stringify({ok:!1,message:"Unauthorized"}),{status:401,headers:e});try{let s=parseInt(r.split("/admin/works/pinned-similar/")[1]);if(!s)return new Response(JSON.stringify({ok:!1,message:"tmdb_id required"}),{status:400,headers:e});let{results:a}=await t.DB.prepare(`
        SELECT w.tmdb_id, w.title_ko, w.title_en, w.poster_path, p.pinned_pct
        FROM work_pinned_similar p
        JOIN works w ON w.tmdb_id = p.related_tmdb_id
        WHERE p.tmdb_id = ?
        ORDER BY p.pinned_pct DESC
      `).bind(s).all();return new Response(JSON.stringify({ok:!0,data:a}),{headers:e})}catch(s){return new Response(JSON.stringify({ok:!1,message:s.message}),{status:500,headers:e})}}if(r==="/admin/works/pinned-similar"&&i.method==="DELETE"){if(!N(i,t))return new Response(JSON.stringify({ok:!1,message:"Unauthorized"}),{status:401,headers:e});try{let s=await i.json().catch(()=>({})),a=parseInt(s.tmdb_id),l=parseInt(s.related_tmdb_id);return!a||!l?new Response(JSON.stringify({ok:!1,message:"\uB450 \uC791\uD488\uC758 tmdb_id\uAC00 \uBAA8\uB450 \uD544\uC694\uD569\uB2C8\uB2E4"}),{status:400,headers:e}):(await t.DB.prepare(`
        DELETE FROM work_pinned_similar
        WHERE (tmdb_id = ? AND related_tmdb_id = ?) OR (tmdb_id = ? AND related_tmdb_id = ?)
      `).bind(a,l,l,a).run(),new Response(JSON.stringify({ok:!0}),{headers:e}))}catch(s){return new Response(JSON.stringify({ok:!1,message:s.message}),{status:500,headers:e})}}if(r==="/admin/persons/collect"&&i.method==="POST"){if(!N(i,t))return new Response(JSON.stringify({ok:!1,message:"Unauthorized"}),{status:401,headers:e});try{let s=await i.json().catch(()=>({})),a=Math.min(parseInt(s.limit)||20,50),{results:l}=await t.DB.prepare(`
        SELECT tmdb_id, media_type FROM works
        WHERE credits_scanned IS NULL OR credits_scanned = 0
        LIMIT ?
      `).bind(a).all();if(!l.length)return new Response(JSON.stringify({ok:!0,worksScanned:0,personsFound:0,remaining:0,message:"\uC2A4\uCE94\uD560 \uC791\uD488 \uC5C6\uC74C"}),{headers:e});let p=new Map,u=[];for(let E of l){u.push(E.tmdb_id);let w=E.media_type==="tv"?"tv":"movie",y=w==="tv"?"aggregate_credits":"credits";try{let k=await fetch(`https://api.themoviedb.org/3/${w}/${E.tmdb_id}/${y}?api_key=${t.TMDB_API_KEY}`);if(!k.ok)continue;let S=await k.json();for(let R of(S.cast||[]).slice(0,15))R.id&&R.name&&!p.has(R.id)&&p.set(R.id,{name:R.name,job:"act"});for(let R of S.crew||[])(R.job==="Director"||R.job==="Creator"||R.department==="Directing"||(R.jobs||[]).some(T=>T.job==="Director"||T.job==="Creator"))&&R.id&&R.name&&p.set(R.id,{name:R.name,job:"direct"})}catch{}}let g=[];for(let[E,w]of p)g.push(t.DB.prepare(`INSERT INTO persons (tmdb_id, name, job) VALUES (?, ?, ?)
             ON CONFLICT(tmdb_id) DO NOTHING`).bind(E,w.name,w.job));for(let E of u)g.push(t.DB.prepare("UPDATE works SET credits_scanned = 1 WHERE tmdb_id = ?").bind(E));g.length&&await t.DB.batch(g);let m=await t.DB.prepare("SELECT COUNT(*) as cnt FROM works WHERE credits_scanned IS NULL OR credits_scanned = 0").first();return new Response(JSON.stringify({ok:!0,worksScanned:l.length,personsFound:p.size,remaining:m?.cnt||0}),{headers:e})}catch(s){return new Response(JSON.stringify({ok:!1,message:s.message}),{status:500,headers:e})}}if(r==="/admin/persons/search"&&i.method==="GET"){if(!N(i,t))return new Response(JSON.stringify({ok:!1,message:"Unauthorized"}),{status:401,headers:e});try{let s=(f.searchParams.get("q")||"").trim();if(!s)return new Response(JSON.stringify({ok:!0,items:[]}),{headers:e});let{results:a}=await t.DB.prepare("SELECT tmdb_id, name, job FROM persons WHERE name LIKE ? ORDER BY name LIMIT 30").bind(`%${s}%`).all();return new Response(JSON.stringify({ok:!0,items:a}),{headers:e})}catch(s){return new Response(JSON.stringify({ok:!1,message:s.message}),{status:500,headers:e})}}if(r.match(/^\/admin\/persons\/\d+$/)&&i.method==="DELETE"){if(!N(i,t))return new Response(JSON.stringify({ok:!1,message:"Unauthorized"}),{status:401,headers:e});try{let s=parseInt(r.split("/")[3]);return await t.DB.prepare("DELETE FROM persons WHERE tmdb_id = ?").bind(s).run(),new Response(JSON.stringify({ok:!0}),{headers:e})}catch(s){return new Response(JSON.stringify({ok:!1,message:s.message}),{status:500,headers:e})}}if(r==="/admin/works/backfill-language"&&i.method==="POST"){if(!N(i,t))return new Response(JSON.stringify({ok:!1,message:"Unauthorized"}),{status:401,headers:e});try{let s=await i.json().catch(()=>({})),a=Math.min(parseInt(s.limit)||30,50),{results:l}=await t.DB.prepare(`
        SELECT tmdb_id, media_type FROM works
        WHERE original_language IS NULL
        LIMIT ?
      `).bind(a).all();if(!l.length)return new Response(JSON.stringify({ok:!0,attempted:0,filled:0,remaining:0,message:"\uCC44\uC6B8 \uC791\uD488 \uC5C6\uC74C"}),{headers:e});let p=[],u=0;for(let m of l){let E=m.media_type?[m.media_type]:["tv","movie"],w=null;for(let y of E)try{let k=await fetch(`https://api.themoviedb.org/3/${y}/${m.tmdb_id}?api_key=${t.TMDB_API_KEY}`);if(!k.ok)continue;let S=await k.json();if(S.original_language){w=S.original_language;break}}catch{}w?(p.push(t.DB.prepare("UPDATE works SET original_language = ? WHERE tmdb_id = ?").bind(w,m.tmdb_id)),u++):p.push(t.DB.prepare("UPDATE works SET original_language = 'unknown' WHERE tmdb_id = ?").bind(m.tmdb_id))}p.length&&await t.DB.batch(p);let g=await t.DB.prepare("SELECT COUNT(*) as cnt FROM works WHERE original_language IS NULL").first();return new Response(JSON.stringify({ok:!0,attempted:l.length,filled:u,remaining:g?.cnt||0}),{headers:e})}catch(s){return new Response(JSON.stringify({ok:!1,message:s.message}),{status:500,headers:e})}}if(r==="/admin/works/backfill-release-year"&&i.method==="POST"){if(!N(i,t))return new Response(JSON.stringify({ok:!1,message:"Unauthorized"}),{status:401,headers:e});try{let s=await i.json().catch(()=>({})),a=Math.min(parseInt(s.limit)||30,50),{results:l}=await t.DB.prepare(`
        SELECT tmdb_id, media_type FROM works
        WHERE release_year IS NULL
        LIMIT ?
      `).bind(a).all();if(!l.length)return new Response(JSON.stringify({ok:!0,attempted:0,filled:0,remaining:0,message:"\uCC44\uC6B8 \uC791\uD488 \uC5C6\uC74C"}),{headers:e});let p=[],u=0;for(let m of l){let E=m.media_type?[m.media_type]:["tv","movie"],w=null;for(let y of E)try{let k=await fetch(`https://api.themoviedb.org/3/${y}/${m.tmdb_id}?api_key=${t.TMDB_API_KEY}`);if(!k.ok)continue;let S=await k.json(),R=S.release_date||S.first_air_date||"",b=parseInt(R.slice(0,4));if(b){w=b;break}}catch{}w?(p.push(t.DB.prepare("UPDATE works SET release_year = ? WHERE tmdb_id = ?").bind(w,m.tmdb_id)),u++):p.push(t.DB.prepare("UPDATE works SET release_year = 0 WHERE tmdb_id = ?").bind(m.tmdb_id))}p.length&&await t.DB.batch(p);let g=await t.DB.prepare("SELECT COUNT(*) as cnt FROM works WHERE release_year IS NULL").first();return new Response(JSON.stringify({ok:!0,attempted:l.length,filled:u,remaining:g?.cnt||0}),{headers:e})}catch(s){return new Response(JSON.stringify({ok:!1,message:s.message}),{status:500,headers:e})}}if(r==="/admin/works/backfill-rating"&&i.method==="POST"){if(!N(i,t))return new Response(JSON.stringify({ok:!1,message:"Unauthorized"}),{status:401,headers:e});try{let s=await i.json().catch(()=>({})),a=Math.min(parseInt(s.limit)||30,50),{results:l}=await t.DB.prepare(`
        SELECT tmdb_id, media_type FROM works
        WHERE tmdb_rating IS NULL AND rating_updated_at IS NULL
        LIMIT ?
      `).bind(a).all();if(!l.length)return new Response(JSON.stringify({ok:!0,attempted:0,filled:0,remaining:0,message:"\uCC44\uC6B8 \uC791\uD488 \uC5C6\uC74C"}),{headers:e});let p=[],u=0,g=new Date().toISOString();for(let E of l){let w=E.media_type?[E.media_type]:["tv","movie"],y=null,k=null,S=!1;for(let R of w)try{let b=await fetch(`https://api.themoviedb.org/3/${R}/${E.tmdb_id}?api_key=${t.TMDB_API_KEY}`);if(!b.ok)continue;let T=await b.json();S=!0,y=T.vote_average??null,k=T.release_date||T.first_air_date||null;break}catch{}S?(p.push(t.DB.prepare("UPDATE works SET tmdb_rating = ?, release_date = ?, rating_updated_at = ? WHERE tmdb_id = ?").bind(y,k,g,E.tmdb_id)),y!==null&&u++):p.push(t.DB.prepare("UPDATE works SET rating_updated_at = ? WHERE tmdb_id = ?").bind(g,E.tmdb_id))}p.length&&await t.DB.batch(p);let m=await t.DB.prepare("SELECT COUNT(*) as cnt FROM works WHERE tmdb_rating IS NULL AND rating_updated_at IS NULL").first();return new Response(JSON.stringify({ok:!0,attempted:l.length,filled:u,remaining:m?.cnt||0}),{headers:e})}catch(s){return new Response(JSON.stringify({ok:!1,message:s.message}),{status:500,headers:e})}}if(r==="/admin/works/batch-imdb-search"&&i.method==="POST"){if(!N(i,t))return new Response(JSON.stringify({ok:!1,message:"Unauthorized"}),{status:401,headers:e});try{let s=30;try{let w=await i.json();w?.limit&&Number.isInteger(w.limit)&&w.limit>0&&(s=w.limit)}catch{}let a=t.OMDB_API_KEY;if(!a)return new Response(JSON.stringify({ok:!1,message:"OMDB key not configured"}),{status:500,headers:e});let p=(await t.DB.prepare("SELECT value AS latest_date FROM app_settings WHERE key = 'latest_ranking_date'").first())?.latest_date||null,{results:u}=await t.DB.prepare(`
        SELECT w.tmdb_id, w.title_en, w.release_year, w.media_type
        FROM works w
        WHERE (w.imdb_id IS NULL OR w.imdb_id = '')
        AND (
          w.imdb_search_attempted_at IS NULL
          OR w.imdb_search_attempted_at < datetime('now', '-7 days')
        )
        ORDER BY
          (
            EXISTS (
              SELECT 1 FROM rankings r
              WHERE r.tmdb_id = w.tmdb_id AND r.date = ?
            )
          ) DESC,
          w.created_at DESC
        LIMIT ?
      `).bind(p,s).all();if(!u.length)return new Response(JSON.stringify({ok:!0,attempted:0,filled:0,remaining:0,message:"\uB300\uC0C1 \uC791\uD488 \uC5C6\uC74C (\uBAA8\uB450 \uB9E4\uCE6D \uC644\uB8CC\uB410\uAC70\uB098 \uCFE8\uB2E4\uC6B4 \uC911)"}),{headers:e});let g=0,m=new Date().toISOString();for(let w of u)try{if(!w.title_en){await t.DB.prepare("UPDATE works SET imdb_search_attempted_at = ? WHERE tmdb_id = ?").bind(m,w.tmdb_id).run();continue}let y=w.media_type==="movie"?"movie":"series",k=new URLSearchParams({t:w.title_en,type:y,apikey:a});w.release_year&&k.set("y",String(w.release_year));let R=await(await fetch(`https://www.omdbapi.com/?${k.toString()}`)).json();if(R.Response!=="False"&&/^tt\d+$/.test(R.imdbID||"")){let b=parseFloat(R.imdbRating);if(isNaN(b))await t.DB.prepare("UPDATE works SET imdb_id = ?, imdb_search_attempted_at = ? WHERE tmdb_id = ?").bind(R.imdbID,m,w.tmdb_id).run();else{let T=R.imdbVotes||"";await t.DB.prepare("UPDATE works SET imdb_id = ?, imdb_rating = ?, imdb_votes = ?, imdb_updated = ?, imdb_search_attempted_at = ? WHERE tmdb_id = ?").bind(R.imdbID,b,T,m,m,w.tmdb_id).run()}g++}else await t.DB.prepare("UPDATE works SET imdb_search_attempted_at = ? WHERE tmdb_id = ?").bind(m,w.tmdb_id).run()}catch(y){console.error(`[IMDB_BATCH_SEARCH] tmdb_id=${w.tmdb_id} \uC624\uB958:`,y.message)}let E=await t.DB.prepare(`
        SELECT COUNT(*) AS cnt FROM works w
        WHERE (w.imdb_id IS NULL OR w.imdb_id = '')
        AND (
          w.imdb_search_attempted_at IS NULL
          OR w.imdb_search_attempted_at < datetime('now', '-7 days')
        )
      `).first();return console.log(`[IMDB_BATCH_SEARCH] \u2705 \uC644\uB8CC: \uC2DC\uB3C4 ${u.length}\uAC74, \uB9E4\uCE6D ${g}\uAC1C`),new Response(JSON.stringify({ok:!0,attempted:u.length,filled:g,remaining:E?.cnt||0}),{headers:e})}catch(s){return new Response(JSON.stringify({ok:!1,message:s.message}),{status:500,headers:e})}}if(r==="/admin/works/imdb-manual"&&i.method==="POST"){if(!N(i,t))return new Response(JSON.stringify({ok:!1,message:"Unauthorized"}),{status:401,headers:e});try{let s=await i.json(),a=parseInt(s?.tmdb_id);if(!a)return new Response(JSON.stringify({ok:!1,message:"tmdb_id required"}),{status:400,headers:e});let l=s?.imdb_rating===""||s?.imdb_rating==null?null:parseFloat(s.imdb_rating);if(l!==null&&(isNaN(l)||l<0||l>10))return new Response(JSON.stringify({ok:!1,message:"imdb_rating\uC740 0~10 \uC0AC\uC774 \uC22B\uC790\uC5EC\uC57C \uD569\uB2C8\uB2E4"}),{status:400,headers:e});let p=(s?.imdb_votes||"").toString().trim()||null,u=await t.DB.prepare("SELECT imdb_id FROM works WHERE tmdb_id = ?").bind(a).first();return u?(await t.DB.prepare("UPDATE works SET imdb_rating = ?, imdb_votes = ?, imdb_updated = datetime('now') WHERE tmdb_id = ?").bind(l,p,a).run(),new Response(JSON.stringify({ok:!0,warning:u.imdb_id?null:"imdb_id\uAC00 \uC5C6\uB294 \uC791\uD488\uC774\uB77C \uD654\uBA74\uC5D0 \uCE74\uB4DC\uAC00 \uC548 \uB730 \uC218 \uC788\uC2B5\uB2C8\uB2E4 (IMDb \uB9E4\uCE6D \uBC30\uCE58 \uC120\uD589 \uD544\uC694)"}),{headers:e})):new Response(JSON.stringify({ok:!1,message:"\uD574\uB2F9 tmdb_id \uC791\uD488\uC744 \uCC3E\uC744 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4"}),{status:404,headers:e})}catch(s){return new Response(JSON.stringify({ok:!1,message:s.message}),{status:500,headers:e})}}if(r==="/admin/works/missing-media-type"&&i.method==="GET"){if(!N(i,t))return new Response(JSON.stringify({ok:!1,message:"Unauthorized"}),{status:401,headers:e});try{let s=Math.min(parseInt(f.searchParams.get("limit"))||10,30),{results:a}=await t.DB.prepare(`
        SELECT tmdb_id, title_ko, poster_path
        FROM works
        WHERE media_type IS NULL OR media_type = ''
        ORDER BY tmdb_id
        LIMIT ?
      `).bind(s).all(),l=await t.DB.prepare("SELECT COUNT(*) as cnt FROM works WHERE media_type IS NULL OR media_type = ''").first();return new Response(JSON.stringify({ok:!0,items:a,remaining:l?.cnt||0}),{headers:e})}catch(s){return new Response(JSON.stringify({ok:!1,message:s.message}),{status:500,headers:e})}}if(r==="/admin/works/bulk-set-media-type"&&i.method==="POST"){if(!N(i,t))return new Response(JSON.stringify({ok:!1,message:"Unauthorized"}),{status:401,headers:e});try{let s=await i.json().catch(()=>({})),l=(Array.isArray(s.items)?s.items:[]).filter(g=>g&&g.tmdb_id&&(g.media_type==="movie"||g.media_type==="tv"));if(!l.length)return new Response(JSON.stringify({ok:!1,message:"\uC720\uD6A8\uD55C \uD56D\uBAA9\uC774 \uC5C6\uC5B4\uC694 (media_type\uC740 'movie' \uB610\uB294 'tv'\uB9CC \uD5C8\uC6A9)"}),{status:400,headers:e});let p=l.map(g=>t.DB.prepare("UPDATE works SET media_type = ? WHERE tmdb_id = ?").bind(g.media_type,parseInt(g.tmdb_id)));await t.DB.batch(p);let u=await t.DB.prepare("SELECT COUNT(*) as cnt FROM works WHERE media_type IS NULL OR media_type = ''").first();return new Response(JSON.stringify({ok:!0,updated:l.length,remaining:u?.cnt||0}),{headers:e})}catch(s){return new Response(JSON.stringify({ok:!1,message:s.message}),{status:500,headers:e})}}if(r==="/admin/grade-settings"&&i.method==="GET"){if(!N(i,t))return new Response(JSON.stringify({ok:!1,message:"Unauthorized"}),{status:401,headers:e});try{let{results:s}=await t.DB.prepare("SELECT * FROM grade_settings ORDER BY sort_order ASC").all();return new Response(JSON.stringify({ok:!0,data:s}),{headers:e})}catch(s){return new Response(JSON.stringify({ok:!1,message:s.message}),{status:500,headers:e})}}if(r==="/admin/grade-settings"&&i.method==="PUT"){if(!N(i,t))return new Response(JSON.stringify({ok:!1,message:"Unauthorized"}),{status:401,headers:e});try{let s=await i.json();if(!Array.isArray(s))return new Response(JSON.stringify({ok:!1,message:"Array required"}),{status:400,headers:e});for(let a of s)await t.DB.prepare(`
          INSERT INTO grade_settings
            (grade_key, grade_name, emoji_url, min_ott_points, is_special, sort_order)
          VALUES (?, ?, ?, ?, ?, ?)
          ON CONFLICT(grade_key) DO UPDATE SET
            grade_name     = excluded.grade_name,
            emoji_url      = excluded.emoji_url,
            min_ott_points = excluded.min_ott_points,
            is_special     = excluded.is_special,
            sort_order     = excluded.sort_order
        `).bind(a.grade_key,a.grade_name,a.emoji_url||"",a.min_ott_points||0,a.is_special?1:0,a.sort_order||0).run();return new Response(JSON.stringify({ok:!0}),{headers:e})}catch(s){return new Response(JSON.stringify({ok:!1,message:s.message}),{status:500,headers:e})}}if(r==="/admin/grade-settings/assign"&&i.method==="POST"){if(!N(i,t))return new Response(JSON.stringify({ok:!1,message:"Unauthorized"}),{status:401,headers:e});try{let{user_id:s,grade_key:a}=await i.json();return!s||!a?new Response(JSON.stringify({ok:!1,message:"user_id, grade_key required"}),{status:400,headers:e}):(await t.DB.prepare("UPDATE users SET grade = ? WHERE id = ?").bind(a,s).run(),new Response(JSON.stringify({ok:!0}),{headers:e}))}catch(s){return new Response(JSON.stringify({ok:!1,message:s.message}),{status:500,headers:e})}}if(r==="/admin/users"&&i.method==="GET"){if(!N(i,t))return new Response(JSON.stringify({ok:!1,message:"Unauthorized"}),{status:401,headers:e});try{let s=parseInt(f.searchParams.get("page")||"1"),a=50,l=(s-1)*a,p=f.searchParams.get("q")||"",u=`
        SELECT u.id, u.nickname, u.provider, u.grade, u.total_likes_received,
          u.created_at, u.last_login, u.ott_points,
          gs.grade_name, gs.emoji_url as grade_emoji_url,
          (SELECT COUNT(*) FROM reviews  WHERE user_id = u.id) as review_count,
          (SELECT COUNT(*) FROM wishlist WHERE user_id = u.id) as wishlist_count,
          (SELECT COUNT(*) FROM posts    WHERE user_id = u.id) as post_count
        FROM users u
        LEFT JOIN grade_settings gs ON gs.grade_key = u.grade
      `,g=[];p&&(u+=" WHERE u.nickname LIKE ?",g.push(`%${p}%`)),u+=" ORDER BY u.created_at DESC LIMIT ? OFFSET ?",g.push(a,l);let{results:m}=await t.DB.prepare(u).bind(...g).all();return new Response(JSON.stringify({ok:!0,data:m}),{headers:e})}catch(s){return new Response(JSON.stringify({ok:!1,message:s.message}),{status:500,headers:e})}}if(r==="/admin/ott-points/adjust"&&i.method==="POST"){if(!N(i,t))return new Response(JSON.stringify({ok:!1,message:"Unauthorized"}),{status:401,headers:e});try{let{user_id:s,points:a,reason:l}=await i.json();if(!s||a===void 0||!l)return new Response(JSON.stringify({ok:!1,message:"user_id, points, reason \uD544\uC218"}),{status:400,headers:e});await t.DB.prepare("INSERT INTO user_point_logs (user_id, points, reason) VALUES (?, ?, ?)").bind(s,a,l).run(),await t.DB.prepare("UPDATE users SET ott_points = MAX(0, COALESCE(ott_points, 0) + ?) WHERE id = ?").bind(a,s).run();let p=await t.DB.prepare("SELECT ott_points FROM users WHERE id = ?").bind(s).first();if(p){let u=await Ft(p.ott_points,t);u&&await t.DB.prepare("UPDATE users SET grade = ? WHERE id = ? AND (grade IS NULL OR grade NOT IN (SELECT grade_key FROM grade_settings WHERE is_special = 1))").bind(u,s).run()}return new Response(JSON.stringify({ok:!0}),{headers:e})}catch(s){return new Response(JSON.stringify({ok:!1,message:s.message}),{status:500,headers:e})}}return null}async function Ft(r,i){try{let{results:t}=await i.DB.prepare(`SELECT grade_key FROM grade_settings
       WHERE is_special = 0 AND min_ott_points <= ?
       ORDER BY min_ott_points DESC LIMIT 1`).bind(r).all();return t[0]?.grade_key||null}catch{return null}}async function dt(r,i,t,f,e){let o=i.method;try{if(o==="GET"&&r==="/contents")return Wt(f,t,e);if(o==="GET"&&r==="/contents/pinned")return Ut(t,e);if(o==="GET"&&r==="/contents/list")return Pt(f,t,e);let n=r.match(/^\/contents\/video\/(\d+)$/);if(o==="GET"&&n)return $t(n[1],t,e);let _=r.match(/^\/contents\/comments\/(\d+)$/);if(o==="GET"&&_)return xt(_[1],t,e);if(o==="POST"&&r==="/contents/comments")return jt(i,t,e);let c=r.match(/^\/contents\/comments\/(\d+)$/);if(o==="DELETE"&&c)return Yt(c[1],i,t,e);if(o==="PATCH"&&r==="/admin/contents/pinned/reorder")return Qt(i,t,e);if(o==="GET"&&r==="/admin/contents/check")return Kt(f,i,t,e);if(o==="GET"&&r==="/admin/contents")return zt(f,i,t,e);if(o==="POST"&&r==="/admin/contents")return Gt(i,t,e);let d=r.match(/^\/admin\/contents\/(\d+)$/);if(o==="PUT"&&d)return Vt(d[1],i,t,e);let s=r.match(/^\/admin\/contents\/(\d+)$/);return o==="DELETE"&&s?Xt(s[1],i,t,e):null}catch(n){return console.error("[contents] \uC624\uB958:",n),new Response(JSON.stringify({ok:!1,error:"\uC11C\uBC84 \uC624\uB958\uAC00 \uBC1C\uC0DD\uD588\uC2B5\uB2C8\uB2E4."}),{status:500,headers:e})}}function A(r,i=200,t={}){return new Response(JSON.stringify(r),{status:i,headers:{"Content-Type":"application/json",...t}})}function $(r,i){return(r.headers.get("Authorization")||"").replace("Bearer ","").trim()===i.ADMIN_SECRET}async function ct(r,i,t,f,e){if(!r||!t)return;let o=await e.DB.prepare("SELECT media_type FROM works WHERE tmdb_id = ?").bind(r).first();if(!o){console.log(`[CONTENTS_LINK] tmdb_id=${r} works\uC5D0 \uC5C6\uC74C \u2014 title_videos \uBCF5\uC0AC \uC2A4\uD0B5`);return}if(!i||o.media_type!==i){console.log(`[CONTENTS_LINK] tmdb_id=${r} \uD0C0\uC785 \uBD88\uC77C\uCE58(works=${o.media_type}, ott_contents=${i}) \u2014 title_videos \uBCF5\uC0AC \uC2A4\uD0B5`);return}await e.DB.prepare(`
    INSERT OR IGNORE INTO title_videos (tmdb_id, youtube_url, youtube_id, title, is_main)
    VALUES (?, ?, ?, ?, 0)
  `).bind(r,`https://www.youtube.com/watch?v=${t}`,t,f||"").run(),console.log(`[CONTENTS_LINK] \u2705 tmdb_id=${r} youtube_id=${t} title_videos \uBCF5\uC0AC \uC644\uB8CC`)}async function Wt(r,i,t){let f=r.searchParams.get("platform"),e=r.searchParams.get("type"),o=Math.min(parseInt(r.searchParams.get("limit")||"20"),50),n=["is_hidden = 0"],_=[];f&&(n.push("platform = ?"),_.push(f)),e&&(n.push("type = ?"),_.push(e));let c=n.join(" AND ");_.push(o);let{results:d}=await i.DB.prepare(`SELECT id, youtube_id, platform, type, title, work_title,
            tmdb_id, tmdb_type, thumbnail, published_at, view_count, is_pinned
     FROM ott_contents
     WHERE ${c}
     ORDER BY published_at DESC
     LIMIT ?`).bind(..._).all();return A({ok:!0,items:d??[]},200,t)}async function Ut(r,i){let{results:t}=await r.DB.prepare(`SELECT id, youtube_id, platform, type, title, work_title,
            tmdb_id, tmdb_type, thumbnail, published_at, view_count,
            is_pinned, sort_order
     FROM ott_contents
     WHERE is_pinned = 1 AND is_hidden = 0
     ORDER BY sort_order ASC
     LIMIT 5`).all();return A({ok:!0,items:t??[]},200,i)}async function Pt(r,i,t){let f=r.searchParams.get("platform"),e=r.searchParams.get("type"),o=Math.max(parseInt(r.searchParams.get("page")||"1"),1),n=30,_=(o-1)*n,c=["is_hidden = 0"],d=[];f&&(c.push("platform = ?"),d.push(f)),e&&(c.push("type = ?"),d.push(e));let s=c.join(" AND "),a=[...d],l=[...d,n,_],[p,u]=await i.DB.batch([i.DB.prepare(`SELECT COUNT(*) as total FROM ott_contents WHERE ${s}`).bind(...a),i.DB.prepare(`SELECT id, youtube_id, platform, type, title, work_title,
              tmdb_id, tmdb_type, thumbnail, published_at, view_count
       FROM ott_contents
       WHERE ${s}
       ORDER BY published_at DESC
       LIMIT ? OFFSET ?`).bind(...l)]),g=p.results?.[0]?.total??0,m=u.results??[];return A({ok:!0,items:m,pagination:{page:o,pageSize:n,total:g,totalPages:Math.ceil(g/n)}},200,t)}async function $t(r,i,t){let f=await i.DB.prepare(`SELECT id, youtube_id, platform, type, title, work_title,
            tmdb_id, tmdb_type, thumbnail, published_at, view_count,
            is_pinned, created_at
     FROM ott_contents
     WHERE id = ? AND is_hidden = 0`).bind(r).first();return f?(i.DB.prepare("UPDATE ott_contents SET view_count = view_count + 1 WHERE id = ?").bind(r).run(),A({ok:!0,item:f},200,t)):A({ok:!1,error:"\uC601\uC0C1\uC744 \uCC3E\uC744 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4."},404,t)}async function xt(r,i,t){let{results:f}=await i.DB.prepare(`SELECT c.id, c.body, c.created_at,
            u.id AS user_id,
            u.nickname,
            u.profile_image
     FROM ott_content_comments c
     JOIN users u ON c.user_id = u.id
     WHERE c.content_id = ? AND c.is_hidden = 0
     ORDER BY c.created_at ASC`).bind(r).all();return A({ok:!0,comments:f??[]},200,t)}async function jt(r,i,t){let f=r.headers.get("Authorization")||"",e=f.startsWith("Bearer ")?f.slice(7).trim():null,o=L(r),n=e||o;if(!n)return A({ok:!1,error:"\uB85C\uADF8\uC778\uC774 \uD544\uC694\uD569\uB2C8\uB2E4."},401,t);let _=await i.DB.prepare(`SELECT s.user_id AS id, u.nickname
     FROM sessions s
     JOIN users u ON u.id = s.user_id
     WHERE s.id = ?
     LIMIT 1`).bind(n).first();if(!_)return A({ok:!1,error:"\uB85C\uADF8\uC778\uC774 \uD544\uC694\uD569\uB2C8\uB2E4."},401,t);let c;try{c=await r.json()}catch{return A({ok:!1,error:"\uC798\uBABB\uB41C \uC694\uCCAD \uD615\uC2DD\uC785\uB2C8\uB2E4."},400,t)}let{content_id:d,body:s}=c;if(!d||!s?.trim())return A({ok:!1,error:"content_id\uC640 \uB313\uAE00 \uB0B4\uC6A9\uC774 \uD544\uC694\uD569\uB2C8\uB2E4."},400,t);if(s.trim().length>500)return A({ok:!1,error:"\uB313\uAE00\uC740 500\uC790 \uC774\uB0B4\uB85C \uC785\uB825\uD574\uC8FC\uC138\uC694."},400,t);if(!await i.DB.prepare("SELECT id FROM ott_contents WHERE id = ? AND is_hidden = 0").bind(d).first())return A({ok:!1,error:"\uC601\uC0C1\uC744 \uCC3E\uC744 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4."},404,t);let l=await i.DB.prepare(`INSERT INTO ott_content_comments (content_id, user_id, body)
     VALUES (?, ?, ?)`).bind(d,_.id,s.trim()).run();return A({ok:!0,id:l.meta?.last_row_id},200,t)}async function Yt(r,i,t,f){let e=i.headers.get("Authorization")||"",o=e.startsWith("Bearer ")?e.slice(7).trim():null,n=L(i),_=o||n;if(!_)return A({ok:!1,error:"\uB85C\uADF8\uC778\uC774 \uD544\uC694\uD569\uB2C8\uB2E4."},401,f);let c=await t.DB.prepare("SELECT s.user_id AS id FROM sessions s WHERE s.id = ? LIMIT 1").bind(_).first();if(!c)return A({ok:!1,error:"\uB85C\uADF8\uC778\uC774 \uD544\uC694\uD569\uB2C8\uB2E4."},401,f);let d=await t.DB.prepare("SELECT id, user_id FROM ott_content_comments WHERE id = ?").bind(r).first();return d?d.user_id!==c.id?A({ok:!1,error:"\uBCF8\uC778 \uB313\uAE00\uB9CC \uC0AD\uC81C\uD560 \uC218 \uC788\uC2B5\uB2C8\uB2E4."},403,f):(await t.DB.prepare("DELETE FROM ott_content_comments WHERE id = ?").bind(r).run(),A({ok:!0},200,f)):A({ok:!1,error:"\uB313\uAE00\uC744 \uCC3E\uC744 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4."},404,f)}async function zt(r,i,t,f){if(!$(i,t))return A({ok:!1,error:"\uAD8C\uD55C\uC774 \uC5C6\uC2B5\uB2C8\uB2E4."},403,f);let e=r.searchParams.get("platform"),o=r.searchParams.get("type"),n=(r.searchParams.get("q")||"").trim(),_=Math.max(parseInt(r.searchParams.get("page")||"1"),1),c=50,d=(_-1)*c,s=["1=1"],a=[];if(e&&(s.push("platform = ?"),a.push(e)),o&&(s.push("type = ?"),a.push(o)),n){let y=n.replace(/\s+/g,"");s.push("(REPLACE(work_title, ' ', '') LIKE ? OR REPLACE(title, ' ', '') LIKE ?)"),a.push(`%${y}%`,`%${y}%`)}let l=s.join(" AND "),p=[...a],u=[...a,c,d],[g,m]=await t.DB.batch([t.DB.prepare(`SELECT COUNT(*) as total FROM ott_contents WHERE ${l}`).bind(...p),t.DB.prepare(`SELECT id, youtube_id, platform, type, title, work_title,
              tmdb_id, tmdb_type, thumbnail, published_at,
              view_count, is_pinned, is_hidden, sort_order, created_at
       FROM ott_contents
       WHERE ${l}
       ORDER BY published_at DESC
       LIMIT ? OFFSET ?`).bind(...u)]),E=g.results?.[0]?.total??0,w=m.results??[];return A({ok:!0,items:w,pagination:{page:_,pageSize:c,total:E,totalPages:Math.ceil(E/c)}},200,f)}async function Kt(r,i,t,f){if(!$(i,t))return A({ok:!1,error:"\uAD8C\uD55C\uC774 \uC5C6\uC2B5\uB2C8\uB2E4."},403,f);let e=r.searchParams.get("youtube_id");if(!e)return A({ok:!1,error:"youtube_id\uAC00 \uD544\uC694\uD569\uB2C8\uB2E4."},400,f);let o=await t.DB.prepare("SELECT id FROM ott_contents WHERE youtube_id = ?").bind(e).first();return A({ok:!0,exists:!!o},200,f)}async function Gt(r,i,t){if(!$(r,i))return A({ok:!1,error:"\uAD8C\uD55C\uC774 \uC5C6\uC2B5\uB2C8\uB2E4."},403,t);let f;try{f=await r.json()}catch{return A({ok:!1,error:"\uC798\uBABB\uB41C \uC694\uCCAD \uD615\uC2DD\uC785\uB2C8\uB2E4."},400,t)}let{youtube_id:e,platform:o,type:n="trailer",title:_,work_title:c,tmdb_id:d,tmdb_type:s,thumbnail:a,published_at:l}=f;if(!e||!o||!_||!l)return A({ok:!1,error:"youtube_id, platform, title, published_at\uB294 \uD544\uC218\uC785\uB2C8\uB2E4."},400,t);if(!["netflix","tving","disney","coupang","wavve","boxoffice","etc"].includes(o))return A({ok:!1,error:"\uC720\uD6A8\uD558\uC9C0 \uC54A\uC740 \uD50C\uB7AB\uD3FC\uC785\uB2C8\uB2E4."},400,t);if(!["trailer","teaser","preview","release"].includes(n))return A({ok:!1,error:"\uC720\uD6A8\uD558\uC9C0 \uC54A\uC740 \uD0C0\uC785\uC785\uB2C8\uB2E4."},400,t);try{let g=await i.DB.prepare(`INSERT INTO ott_contents
         (youtube_id, platform, type, title, work_title,
          tmdb_id, tmdb_type, thumbnail, published_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`).bind(e,o,n,_,c||null,d||null,s||null,a||null,l).run();if(d&&c)try{await i.DB.prepare(`INSERT OR IGNORE INTO works (tmdb_id, media_type, title_ko, match_source)
           VALUES (?, ?, ?, 'crawler')`).bind(d,s||null,c).run()}catch(m){console.error("[contents] works \uC790\uB3D9\uB4F1\uB85D \uC2E4\uD328(\uBB34\uC2DC):",m.message)}if(d)try{await ct(d,s||null,e,_,i)}catch(m){console.error("[contents] title_videos \uBCF5\uC0AC \uC2E4\uD328(\uBB34\uC2DC):",m.message)}return A({ok:!0,id:g.meta?.last_row_id},200,t)}catch(g){if(g.message?.includes("UNIQUE"))return A({ok:!1,error:"\uC774\uBBF8 \uB4F1\uB85D\uB41C YouTube \uC601\uC0C1\uC785\uB2C8\uB2E4."},409,t);throw g}}async function Vt(r,i,t,f){if(!$(i,t))return A({ok:!1,error:"\uAD8C\uD55C\uC774 \uC5C6\uC2B5\uB2C8\uB2E4."},403,f);let e;try{e=await i.json()}catch{return A({ok:!1,error:"\uC798\uBABB\uB41C \uC694\uCCAD \uD615\uC2DD\uC785\uB2C8\uB2E4."},400,f)}let o=await t.DB.prepare("SELECT id, youtube_id, title, tmdb_type FROM ott_contents WHERE id = ?").bind(r).first();if(!o)return A({ok:!1,error:"\uC601\uC0C1\uC744 \uCC3E\uC744 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4."},404,f);let n=["work_title","tmdb_id","tmdb_type","type","is_pinned","is_hidden","sort_order"],_=[],c=[];for(let d of n)e[d]!==void 0&&(_.push(`${d} = ?`),c.push(e[d]));if(_.length===0)return A({ok:!1,error:"\uC218\uC815\uD560 \uAC12\uC774 \uC5C6\uC2B5\uB2C8\uB2E4."},400,f);if(c.push(r),await t.DB.prepare(`UPDATE ott_contents SET ${_.join(", ")} WHERE id = ?`).bind(...c).run(),e.tmdb_id!==void 0)try{let d=e.tmdb_type!==void 0?e.tmdb_type:o.tmdb_type;await ct(e.tmdb_id,d,o.youtube_id,o.title,t)}catch(d){console.error("[contents] title_videos \uBCF5\uC0AC \uC2E4\uD328(\uBB34\uC2DC):",d.message)}return A({ok:!0},200,f)}async function Xt(r,i,t,f){return $(i,t)?await t.DB.prepare("SELECT id FROM ott_contents WHERE id = ?").bind(r).first()?(await t.DB.prepare("DELETE FROM ott_contents WHERE id = ?").bind(r).run(),A({ok:!0},200,f)):A({ok:!1,error:"\uC601\uC0C1\uC744 \uCC3E\uC744 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4."},404,f):A({ok:!1,error:"\uAD8C\uD55C\uC774 \uC5C6\uC2B5\uB2C8\uB2E4."},403,f)}async function Qt(r,i,t){if(!$(r,i))return A({ok:!1,error:"\uAD8C\uD55C\uC774 \uC5C6\uC2B5\uB2C8\uB2E4."},403,t);let f;try{f=await r.json()}catch{return A({ok:!1,error:"\uC798\uBABB\uB41C \uC694\uCCAD \uD615\uC2DD\uC785\uB2C8\uB2E4."},400,t)}let{ordered_ids:e}=f;if(!Array.isArray(e)||e.length===0)return A({ok:!1,error:"ordered_ids \uBC30\uC5F4\uC774 \uD544\uC694\uD569\uB2C8\uB2E4."},400,t);if(e.length>5)return A({ok:!1,error:"\uACE0\uC815 \uC601\uC0C1\uC740 \uCD5C\uB300 5\uAC1C\uC785\uB2C8\uB2E4."},400,t);let o=[i.DB.prepare("UPDATE ott_contents SET is_pinned = 0, sort_order = 0"),...e.map((n,_)=>i.DB.prepare("UPDATE ott_contents SET is_pinned = 1, sort_order = ? WHERE id = ?").bind(_+1,n))];return await i.DB.batch(o),A({ok:!0},200,t)}var ft="https://api.anthropic.com/v1/messages",_t="https://ottrank.kr",x={netflix:"\uB137\uD50C\uB9AD\uC2A4",tving:"\uD2F0\uBE59",wavve:"\uC6E8\uC774\uBE0C",disney:"\uB514\uC988\uB2C8+",coupang:"\uCFE0\uD321\uD50C\uB808\uC774",boxoffice:"\uBC15\uC2A4\uC624\uD53C\uC2A4"},pt={friendly:`\uB124\uC774\uBC84 \uBE14\uB85C\uADF8 \uAC10\uC131 \uB9D0\uD22C. \uC9E7\uC740 \uC904\uBC14\uAFC8, \uBCF8\uC778 \uC598\uAE30\uB85C \uC2DC\uC791, \uB3C5\uC790\uC5D0\uAC8C \uB9D0 \uAC70\uB294 \uB290\uB08C.
\uC608\uC2DC (\uC774 \uAD6C\uC870 \uADF8\uB300\uB85C \uB530\uB77C\uD560 \uAC83):

\uC548\uB155\uD558\uC138\uC694, \uC800 \uC694\uC998 \uB4DC\uB77C\uB9C8\uC5D0 \uBE60\uC838\uC11C
\uC8FC\uB9D0\uC744 \uD1B5\uC9F8\uB85C \uB0A0\uB9AC\uACE0 \uC788\uC5B4\uC694\u314B\u314B

\uC774\uBC88 \uC8FC \uB137\uD50C\uB9AD\uC2A4 \uC21C\uC704 \uBCF4\uB2E4\uAC00
\uC9C4\uC9DC \uAE5C\uC9DD \uB180\uB790\uAC70\uB4E0\uC694
1\uC704\uAC00 \uC644\uC804 \uC608\uC0C1 \uBC16\uC774\uC5C8\uC5B4\uC11C\uC694

\uC800\uB3C4 \uC5B4\uC81C 1\uD654 \uBC14\uB85C \uBD24\uB294\uB370
\uC0DD\uAC01\uBCF4\uB2E4 \uD6E8\uC52C \uC7AC\uBC0C\uB354\uB77C\uACE0\uC694
\uD55C \uD654 \uBCF4\uACE0 \uBA48\uCD94\uC9C8 \uBABB\uD588\uC5B4\uC694`,expert:`\uB4DC\uB77C\uB9C8 \uB9AC\uBDF0 \uC804\uBB38 \uBE14\uB85C\uAC70. \uC5F0\uCD9C\xB7\uC5F0\uAE30\xB7\uC2A4\uD1A0\uB9AC\uB97C \uAD6C\uCCB4\uC801\uC73C\uB85C \uBD84\uC11D\uD568.
\uC608\uC2DC \uBB38\uC7A5:
- "\uC5F0\uCD9C \uBA74\uC5D0\uC11C \uD2B9\uD788 \uB208\uC5D0 \uB744\uB294 \uAC74 \uCD08\uBC18 3\uD654\uC758 \uD638\uD761\uC778\uB370\uC694. \uBD88\uD544\uC694\uD55C \uC7A5\uBA74\uC744 \uCCD0\uB0B4\uACE0 \uD575\uC2EC\uB9CC \uB0A8\uAE34 \uD3B8\uC9D1\uC774 \uBAB0\uC785\uAC10\uC744 \uC0B4\uB9BD\uB2C8\uB2E4"
- "\uC8FC\uC5F0 \uBC30\uC6B0\uC758 \uB208\uBE5B \uC5F0\uAE30\uAC00 \uB300\uC0AC\uBCF4\uB2E4 \uB9CE\uC740 \uAC78 \uB9D0\uD558\uB294 \uC7A5\uBA74\uC774 \uC5EC\uB7FF \uC788\uC5B4\uC694. \uD2B9\uD788 3\uD654 \uC5D4\uB529\uC740..."
- "\uC62C\uD574 \uB098\uC628 \uD55C\uAD6D \uB4DC\uB77C\uB9C8 \uC911 \uC644\uC131\uB3C4\uB85C\uB294 \uC0C1\uC704\uAD8C\uC774\uB77C\uACE0 \uBD05\uB2C8\uB2E4. \uB2E8 \uAE30\uB300\uCE58\uB97C \uB0AE\uCD94\uACE0 \uBCF4\uC154\uC57C \uD560 \uBD80\uBD84\uB3C4 \uC788\uC5B4\uC694"`,humor:`\uB9AC\uC561\uC158 \uD070 \uB4DC\uB77C\uB9C8 \uB355\uD6C4. \uBCF8\uC778 \uAC10\uC815\uC744 \uACFC\uC7A5\uB418\uAC8C \uD45C\uD604\uD568.
\uC608\uC2DC \uBB38\uC7A5:
- "\uC57C \uC774\uAC70 \uBCF4\uB2E4\uAC00 \uC9C4\uC9DC \uC18C\uB9AC \uC9C8\uB800\uC5B4\uC694\u314B\u314B\u314B \uACB0\uB9D0\uC5D0\uC11C \uC800 \uD63C\uC790 \uBC29\uC5D0\uC11C \uBA58\uBD95 \uC654\uAC70\uB4E0\uC694"
- "\uC774 \uB4DC\uB77C\uB9C8 \uB54C\uBB38\uC5D0 \uC694\uC998 \uC7A0\uC744 \uBABB \uC790\uACE0 \uC788\uC2B5\uB2C8\uB2E4. \uBC24\uC0C8 \uBD24\uC5B4\uC694 \uC194\uC9C1\uD788..."
- "1\uD654 \uBCF4\uACE0 '\uC5B4 \uADF8\uB0E5 \uADF8\uB807\uAD6C\uB098' \uD588\uB294\uB370 4\uD654\uBD80\uD130 \uBBF8\uCCD0\uAC00\uAE30 \uC2DC\uC791\uD568\u314B\u314B"`,news:`\uC815\uBCF4 \uC804\uB2EC \uC704\uC8FC. \uC218\uCE58\xB7\uC0AC\uC2E4 \uC911\uC2EC\uC73C\uB85C \uB2F4\uBC31\uD558\uAC8C \uC500.
\uC608\uC2DC \uBB38\uC7A5:
- "\uC774\uBC88 \uC8FC \uB137\uD50C\uB9AD\uC2A4 \uAD6D\uB0B4 1\uC704\uB294 \uC9C0\uB09C\uC8FC\uC640 \uB3D9\uC77C\uD558\uAC8C \uC720\uC9C0\uB410\uC2B5\uB2C8\uB2E4"
- "\uACF5\uAC1C 3\uC77C \uB9CC\uC5D0 \uAE00\uB85C\uBC8C TOP 10 \uC9C4\uC785, \uD604\uC7AC 6\uC704\uB97C \uAE30\uB85D \uC911\uC785\uB2C8\uB2E4"
- "\uC2DC\uCCAD\uC790 \uD3C9\uC810 \uAE30\uC900 \uC774\uBC88 \uC2DC\uC98C \uD3C9\uADE0 8.2\uC810\uC73C\uB85C \uC804\uC791\uBCF4\uB2E4 0.4\uC810 \uC0C1\uC2B9\uD588\uC2B5\uB2C8\uB2E4"`,sns:`\uC9E7\uACE0 \uC9C1\uAD00\uC801\uC778 MZ \uB9D0\uD22C. \uC904\uC784\uB9D0\xB7\uC774\uBAA8\uC9C0 \uC790\uC5F0\uC2A4\uB7FD\uAC8C \uC0AC\uC6A9.
\uC608\uC2DC \uBB38\uC7A5:
- "\uC694\uC998 \uB137\uD50C \uBB50\uBD04? \uB098 \uC774\uAC70 \uBCF4\uB294 \uC911\uC778\uB370 \uC9C4\uC9DC \uC7AC\uBC0C\uC74C"
- "\uC774\uAC70 \uC548 \uBD24\uC73C\uBA74 \uC190\uD574 \u3139\u3147.. \uC8FC\uBCC0\uC5D0 \uB2E4 \uAD8C\uD558\uB294 \uC911"
- "1\uD654\uB9CC \uBCF4\uB824\uB2E4 \uC0C8\uBCBD 3\uC2DC\uC784.. \uB0B4\uC77C \uCD9C\uADFC\uC778\uB370 \uC5B4\uB5A1\uD558\uC9C0"`,magazine:`\uAC10\uC131\uC801\uC774\uACE0 \uBB38\uD559\uC801\uC778 \uBB38\uCCB4. \uBD84\uC704\uAE30\uC640 \uC5EC\uC6B4\uC744 \uAC15\uC870\uD568.
\uC608\uC2DC \uBB38\uC7A5:
- "\uC774\uBC88 \uC8FC\uB9D0, \uB2F9\uC2E0\uC758 \uC18C\uD30C\uC640 \uC774 \uB4DC\uB77C\uB9C8\uBA74 \uCDA9\uBD84\uD569\uB2C8\uB2E4"
- "\uBCF4\uACE0 \uB098\uC11C \uD55C\uB3D9\uC548 \uBA4D\uD558\uB2C8 \uC788\uC5C8\uC5B4\uC694. \uADF8\uB7F0 \uB4DC\uB77C\uB9C8 \uC624\uB79C\uB9CC\uC774\uC5C8\uAC70\uB4E0\uC694"
- "\uC5B4\uB5A4 \uB4DC\uB77C\uB9C8\uB294 \uB05D\uB098\uACE0 \uB098\uC11C\uB3C4 \uD55C\uCC38\uC744 \uBA38\uB9BF\uC18D\uC5D0 \uB0A8\uC544\uC694. \uC774\uAC8C \uADF8\uB7F0 \uC791\uD488\uC785\uB2C8\uB2E4"`},mt={weekly_ranking:"\uC8FC\uAC04 TOP10 \uB7AD\uD0B9 \uD3EC\uC2A4\uD305\uC744 \uC791\uC131\uD574\uC8FC\uC138\uC694. \uC21C\uC704\uC640 \uD568\uAED8 \uAC01 \uC791\uD488\uC744 \uC18C\uAC1C\uD558\uACE0, \uC774\uBC88 \uC8FC \uD2B9\uD788 \uC8FC\uBAA9\uD560 \uC791\uD488\uC744 \uAC15\uC870\uD574\uC8FC\uC138\uC694.",recommendation:"\uC9C0\uAE08 \uB2F9\uC7A5 \uBD10\uC57C \uD560 \uCD94\uCC9C \uC791\uD488 \uBAA8\uC74C \uD3EC\uC2A4\uD305\uC744 \uC791\uC131\uD574\uC8FC\uC138\uC694. \uAC01 \uC791\uD488\uC758 \uB9E4\uB825 \uD3EC\uC778\uD2B8\uC640 \uCD94\uCC9C \uC774\uC720\uB97C \uAD6C\uCCB4\uC801\uC73C\uB85C \uAC15\uC870\uD574\uC8FC\uC138\uC694.",genre:"\uC7A5\uB974\uBCC4\uB85C \uC791\uD488\uC744 \uBD84\uB958\uD558\uACE0, \uC5B4\uB5A4 \uCDE8\uD5A5\uC758 \uC0AC\uB78C\uC5D0\uAC8C \uC5B4\uC6B8\uB9AC\uB294\uC9C0 \uC124\uBA85\uC744 \uD3EC\uD568\uD55C \uCD94\uCC9C \uD3EC\uC2A4\uD305\uC744 \uC791\uC131\uD574\uC8FC\uC138\uC694.",review:"\uC0C1\uC704 3~5\uAC1C \uC791\uD488\uC5D0 \uC9D1\uC911\uD574\uC11C \uC904\uAC70\uB9AC, \uBCFC\uAC70\uB9AC, \uCD94\uCC9C \uD3EC\uC778\uD2B8\uB97C \uB2F4\uC740 \uBBF8\uB2C8 \uB9AC\uBDF0 \uD615\uD0DC\uC758 \uD3EC\uC2A4\uD305\uC744 \uC791\uC131\uD574\uC8FC\uC138\uC694."},ut={ranking:{label:"\uC21C\uC704\uD615",examples:["{platform} {media} \uC21C\uC704 TOP 10 ({week} \uC5C5\uB370\uC774\uD2B8)","\uC694\uC998 {platform} \uC21C\uC704 {media} TOP 10 \uACE8\uB77C\uBD04","{week} {platform} \uC21C\uC704 {media} \uC815\uB9AC","{platform} \uC624\uB298 \uC21C\uC704 TOP 10 {media} (\uCD5C\uC2E0)"],rule:`1. "{platform} + \uC21C\uC704 + TOP N \uB610\uB294 \uB0A0\uC9DC" \uC870\uD569 \uD544\uC218
2. \uC2E4\uC81C \uB7AD\uD0B9 1~3\uC704 \uC791\uD488\uBA85\uC744 \uC81C\uBAA9\uC5D0 \uC9C1\uC811 \uD65C\uC6A9 (\uAC80\uC0C9\uB7C9 \uADF9\uB300\uD654)
3. \uB0A0\uC9DC/\uC8FC\uCC28 \uD45C\uAE30\uB85C \uCD5C\uC2E0\uC131 \uAC15\uC870 (\uC608: {week}, 2026 \uCD5C\uC2E0)`},recommendation:{label:"\uCD94\uCC9C\uD615",examples:["\uC9C0\uAE08 \uB2F9\uC7A5 \uBD10\uC57C \uD560 {platform} \uCD94\uCC9C {media} BEST 5","{platform} \uBCFC\uB9CC\uD55C\uAC70 \uC5C6\uC744 \uB54C \uCD94\uCC9C {media} TOP 7","\uC694\uC998 \uD56B\uD55C {platform} {media} \uCD94\uCC9C 2026 \uCD5C\uC2E0\uD310","{platform} {media} \uCD94\uCC9C \uC7A5\uB974\uBCC4 \uBAA8\uC74C (\uB85C\uB9E8\uC2A4\xB7\uC2A4\uB9B4\uB7EC\xB7\uBC94\uC8C4)"],rule:`1. "\uC9C0\uAE08 \uBD10\uC57C \uD560", "\uCD94\uCC9C", "BEST", "\uAC15\uCD94" \uB4F1 \uD050\uB808\uC774\uC158 \uD0A4\uC6CC\uB4DC \uD544\uC218
2. TOP N \uC22B\uC790\uB294 \uC120\uD0DD\uC801\uC73C\uB85C\uB9CC \uC0AC\uC6A9 \u2014 \uC21C\uC704 \uB098\uC5F4\uD615 \uC81C\uBAA9\uC73C\uB85C \uD750\uB974\uC9C0 \uB9D0 \uAC83
3. \uC7A5\uB974\xB7\uCDE8\uD5A5 \uAE30\uBC18 \uD45C\uD604\uC744 \uC801\uADF9 \uD65C\uC6A9`},review:{label:"\uB9AC\uBDF0\uD615",examples:["{platform} 1\uC704 [\uC791\uD488\uBA85] \uC194\uC9C1 \uD6C4\uAE30 \uC7AC\uBC0C\uC5B4? \uACB0\uB9D0\uAE4C\uC9C0","[\uC791\uD488\uBA85] {platform} {media} \uC644\uC8FC \uD6C4\uAE30 (\uC2A4\uD3EC\uC5C6\uC74C)","{platform} [\uC791\uD488\uBA85] \uC815\uC8FC\uD589 \uC644\uB8CC \uBCC4\uC810 \uBA87 \uC810?"],rule:`1. \uB7AD\uD0B9 1\uC704 \uC791\uD488 \uD558\uB098\uC5D0 \uC9D1\uC911\uD55C \uB2E8\uC77C \uC791\uD488 \uB9AC\uBDF0 \uC81C\uBAA9
2. "\uD6C4\uAE30", "\uC194\uC9C1 \uB9AC\uBDF0", "\uACB0\uB9D0", "\uC815\uC8FC\uD589" \uB4F1 \uAC10\uC0C1 \uD0A4\uC6CC\uB4DC \uD544\uC218
3. TOP N \uC21C\uC704 \uB098\uC5F4\uD615 \uC81C\uBAA9\uC740 \uC808\uB300 \uC0AC\uC6A9\uD558\uC9C0 \uB9D0 \uAC83`},issue:{label:"\uD654\uC81C\uD615",examples:["{platform} {media} \uD654\uC81C\uC791 \uC774\uBC88 \uC8FC \uB193\uCE58\uBA74 \uD6C4\uD68C TOP 5","2026 \uC0C1\uBC18\uAE30 {platform} {media} \uD765\uD589 \uC21C\uC704 \uC815\uB9AC","{platform} [\uC791\uD488\uBA85] \uC2DC\uC98C2 \uAE30\uB300\uB418\uB294 \uC774\uC720"],rule:`1. "\uD654\uC81C", "\uC774\uC288", "\uD765\uD589", "\uB17C\uB780", "\uC2DC\uC98C2 \uAE30\uB300" \uB4F1 \uD654\uC81C\uC131 \uD0A4\uC6CC\uB4DC \uD544\uC218
2. \uB2E8\uC21C \uC21C\uC704 \uB098\uC5F4\uD615(TOP N) \uC81C\uBAA9\uC740 \uC9C0\uC591\uD558\uACE0 \uD654\uC81C\uC131\uC5D0 \uC9D1\uC911`}};async function V(r,i,t=null){let f=t?`SELECT category_slot, display_name, platform_limit, source_name
       FROM ott_categories
       WHERE platform = ?
         AND is_active = 1
         AND platform_section IS NOT NULL
         AND category_slot = ?
       ORDER BY platform_order ASC`:`SELECT category_slot, display_name, platform_limit, source_name
       FROM ott_categories
       WHERE platform = ?
         AND is_active = 1
         AND platform_section IS NOT NULL
       ORDER BY platform_order ASC`,e=t?await i.DB.prepare(f).bind(r,t).all():await i.DB.prepare(f).bind(r).all();if(!e.results||e.results.length===0)return[];let o=[];for(let n of e.results){let _=n.platform_limit||10,c=await i.DB.prepare(`SELECT
         r.rank,
         COALESCE(w.title_ko, r.title_ko) AS title_ko,
         COALESCE(w.title_en, r.title_en) AS title_en,
         r.tmdb_id,
         w.poster_path,
         w.genre,
         w.tmdb_rating,
         w.release_year
       FROM rankings r
       LEFT JOIN works w ON r.tmdb_id = w.tmdb_id
       WHERE r.platform = ?
         AND r.category_slot = ?
         AND (
           r.date = 'manual'
           OR r.date = (
             SELECT MAX(date)
             FROM rankings
             WHERE platform = ?
               AND category_slot = ?
               AND date != 'manual'
           )
         )
       ORDER BY
         CASE WHEN r.date = 'manual' THEN 0 ELSE 1 END,
         r.rank ASC
       LIMIT ?`).bind(r,n.category_slot,r,n.category_slot,_).all();c.results&&c.results.length>0&&o.push({category_slot:n.category_slot,display_name:n.display_name,source_name:n.source_name||"",items:c.results})}return o}function Zt(r,i){let f=`[${x[i]||i} \uD604\uC7AC \uB7AD\uD0B9 \uB370\uC774\uD130]

`;return r.forEach(e=>{!e.items||e.items.length===0||(f+=`## ${e.display_name}
`,e.items.forEach((o,n)=>{let _=o.title_ko||o.title_en||"\uC81C\uBAA9 \uC5C6\uC74C",c=o.tmdb_rating?` (\uC624\uB728\uB791 \uD3C9\uC810: ${o.tmdb_rating})`:"",d=o.release_year?` [${o.release_year}\uB144]`:"",s=o.genre?` | \uC7A5\uB974: ${o.genre}`:"";f+=`${n+1}\uC704. ${_}${d}${c}${s}
`}),f+=`
`)}),f}function gt(){let r=new Date,i=r.getFullYear(),t=r.getMonth()+1,f=Math.ceil(r.getDate()/7);return`${i}\uB144 ${t}\uC6D4 ${f}\uC8FC\uCC28`}async function vt(r,i,{useWebSearch:t=!0,maxTokens:f=4096}={}){let e={model:"claude-sonnet-4-6",max_tokens:f,messages:[{role:"user",content:r}]};t&&(e.tools=[{type:"web_search_20250305",name:"web_search",max_uses:5}]);let o=await fetch(ft,{method:"POST",headers:{"Content-Type":"application/json","x-api-key":i,"anthropic-version":"2023-06-01"},body:JSON.stringify(e)});if(!o.ok){let _=await o.json().catch(()=>({}));throw new Error(_.error?.message||`Anthropic API \uC624\uB958: ${o.status}`)}return((await o.json()).content||[]).filter(_=>_.type==="text").map(_=>_.text).join(`
`)}async function Et(r,i,t,f,e){if(i.method==="GET"&&r==="/blog-gen/image"){let o=f.searchParams.get("path")||"",n=f.searchParams.get("size")||"w780";if(!o)return new Response(JSON.stringify({ok:!1,error:"path \uD30C\uB77C\uBBF8\uD130 \uD544\uC694"}),{status:400,headers:e});try{let _=`https://image.tmdb.org/t/p/${n}${o}`,c=await fetch(_);if(!c.ok)throw new Error(`\uC774\uBBF8\uC9C0 \uB85C\uB4DC \uC2E4\uD328: ${c.status}`);let d=await c.arrayBuffer(),s=c.headers.get("content-type")||"image/jpeg";return new Response(d,{status:200,headers:{"Content-Type":s,"Access-Control-Allow-Origin":e["Access-Control-Allow-Origin"],"Cache-Control":"public, max-age=86400"}})}catch(_){return new Response(JSON.stringify({ok:!1,error:_.message}),{status:500,headers:e})}}if(i.method==="GET"&&r==="/blog-gen/preview"){if(!N(i,t))return new Response(JSON.stringify({ok:!1,error:"Unauthorized"}),{status:401,headers:e});let o=f.searchParams.get("platform")||"netflix",n=f.searchParams.get("categorySlot")||null;if(!x[o])return new Response(JSON.stringify({ok:!1,error:"\uC9C0\uC6D0\uD558\uC9C0 \uC54A\uB294 \uD50C\uB7AB\uD3FC\uC785\uB2C8\uB2E4."}),{status:400,headers:e});try{let _=await V(o,t,n);return new Response(JSON.stringify({ok:!0,data:_}),{headers:e})}catch(_){return new Response(JSON.stringify({ok:!1,error:_.message}),{status:500,headers:e})}}if(i.method==="POST"&&r==="/blog-gen/suggest"){if(!N(i,t))return new Response(JSON.stringify({ok:!1,error:"Unauthorized"}),{status:401,headers:e});let o=t.ANTHROPIC_API_KEY;if(!o)return new Response(JSON.stringify({ok:!1,error:"ANTHROPIC_API_KEY \uD658\uACBD \uBCC0\uC218\uAC00 \uC124\uC815\uB418\uC9C0 \uC54A\uC558\uC2B5\uB2C8\uB2E4."}),{status:500,headers:e});let n;try{n=await i.json()}catch{return new Response(JSON.stringify({ok:!1,error:"\uC798\uBABB\uB41C \uC694\uCCAD \uD615\uC2DD\uC785\uB2C8\uB2E4."}),{status:400,headers:e})}let{platform:_="netflix",topicType:c="ranking",categorySlot:d="all"}=n;try{let s=[],a=_==="all"?["netflix","tving"]:[_],l=_!=="all"&&d&&d!=="all"?d:null;for(let O of a){if(O!=="all"&&!x[O])continue;let h=await V(O,t,l);s.push(...h)}let p="";s.length>0?p=s.map(O=>`[${O.display_name}]
`+(O.items||[]).slice(0,5).map((h,C)=>{let I=h.title_ko||h.title_en||"\uC81C\uBAA9 \uC5C6\uC74C",J=h.genre?` (${h.genre.split(",")[0]})`:"",B=h.tmdb_rating?` \u2605${parseFloat(h.tmdb_rating).toFixed(1)}`:"";return`  ${C+1}\uC704. ${I}${J}${B}`}).join(`
`)).join(`

`):p="\uD604\uC7AC \uB7AD\uD0B9 \uB370\uC774\uD130 \uC5C6\uC74C. OTT \uC778\uAE30 \uCF58\uD150\uCE20 \uC77C\uBC18 \uD2B8\uB80C\uB4DC \uAE30\uBC18\uC73C\uB85C \uCD94\uCC9C\uD574\uC8FC\uC138\uC694.";let u=_==="all"?"\uB137\uD50C\uB9AD\uC2A4\xB7\uD2F0\uBE59":x[_]||_,g=gt(),m=(()=>{if(s.length===1){let O=s[0].display_name||"";if(O.includes("\uC601\uD654"))return"\uC601\uD654";if(O.includes("\uB4DC\uB77C\uB9C8")||O.includes("TV")||O.includes("\uC2DC\uB9AC\uC988"))return"\uB4DC\uB77C\uB9C8"}return"\uB4DC\uB77C\uB9C8\xB7\uC601\uD654"})(),E=ut[c]||ut.ranking,w=E.examples.map(O=>"- "+O.replace(/{platform}/g,u).replace(/{media}/g,m).replace(/{week}/g,g)).join(`
`),y=E.rule.replace(/{platform}/g,u).replace(/{week}/g,g),k=`\uB2F9\uC2E0\uC740 \uB124\uC774\uBC84 \uBE14\uB85C\uADF8 SEO \uC804\uBB38\uAC00\uC785\uB2C8\uB2E4.
\uC544\uB798\uB294 \uB124\uC774\uBC84\uC5D0\uC11C \uC2E4\uC81C\uB85C \uC0C1\uC704 \uB178\uCD9C\uB418\uB294 OTT \uBE14\uB85C\uADF8 \uC81C\uBAA9 \uD328\uD134 \uC911 "${E.label}" \uC720\uD615 \uC608\uC2DC\uC785\uB2C8\uB2E4.
\uC774\uBC88 \uCD94\uCC9C\uC740 \uBC18\uB4DC\uC2DC "${E.label}" \uC2A4\uD0C0\uC77C\uB85C\uB9CC \uC791\uC131\uD558\uACE0, \uB2E4\uB978 \uC720\uD615\uACFC \uC11E\uC9C0 \uB9C8\uC138\uC694.

[${E.label} \uD328\uD134 \uC608\uC2DC]
${w}

\uD604\uC7AC \uB7AD\uD0B9 \uB370\uC774\uD130:
\uD50C\uB7AB\uD3FC: ${u} / \uAE30\uAC04: ${g}

${p}

\uC704 \uB370\uC774\uD130\uC5D0 \uC5C6\uB294 \uC8FC\uC81C(\uC608: \uB2E4\uC74C \uB2EC \uACF5\uAC1C \uC608\uC815 \uC2E0\uC791, \uC774\uBC88 \uBD84\uAE30\xB7\uBC18\uAE30 \uACB0\uC0B0, \uC544\uC9C1 \uB7AD\uD0B9\uC5D0 \uC548 \uC7A1\uD78C
\uCD5C\uC2E0 \uD654\uC81C\uC791\xB7\uC774\uC288 \uB4F1)\uB97C \uB2E4\uB904\uC57C \uD55C\uB2E4\uBA74, web_search\uB97C \uC5EC\uB7EC \uBC88 \uC0AC\uC6A9\uD574\uC11C \uC5B8\uB860 \uBCF4\uB3C4\xB7\uD654\uC81C\uC131\xB7
\uACF5\uAC1C \uC2DC\uAE30\xB7\uC2DC\uC98C \uAC31\uC2E0 \uC5EC\uBD80 \uAC19\uC740 \uB2E8\uC11C\uB4E4\uC744 \uCDA9\uBD84\uD788 \uBAA8\uC740 \uB4A4, \uADF8\uAC78 \uADFC\uAC70\uB85C \uC21C\uC704\xB7\uCD94\uCC9C \uB9AC\uC2A4\uD2B8\uB97C
\uB2F9\uB2F9\uD558\uAC8C \uB9CC\uB4E4\uC5B4\uB0B4\uC138\uC694. "\uC815\uD655\uD55C \uACF5\uC2DD \uC218\uCE58\uAC00 \uC5C6\uB2E4"\uB294 \uC2DD\uC73C\uB85C \uBC1C\uBE8C\uD558\uAC70\uB098 \uC560\uB9E4\uD558\uAC8C \uC5BC\uBC84\uBB34\uB9AC\uC9C0
\uB9D0\uACE0, \uC2E4\uC81C OTT \uBE14\uB85C\uAC70\uAC00 \uC4F0\uB4EF \uC790\uC5F0\uC2A4\uB7FD\uAC8C \uB2E8\uC815\uD574\uC11C \uC4F0\uC138\uC694. \uB2E8, \uAC80\uC0C9 \uACB0\uACFC \uBB38\uC7A5\uC744 \uADF8\uB300\uB85C
\uBCA0\uB07C\uC9C0 \uB9D0\uACE0 \uC9C1\uC811 \uC0C8\uB85C \uD45C\uD604\uD574\uC57C \uD569\uB2C8\uB2E4.

\uC81C\uBAA9 \uC0DD\uC131 \uC870\uAC74:
${y}
4. 15~35\uC790 \uD55C\uAD6D\uC5B4, \uD2B9\uC218\uAE30\uD638 \uCD5C\uC18C\uD654
5. 8\uAC1C \uBAA8\uB450 \uC704 "${E.label}" \uD328\uD134 \uC2A4\uD0C0\uC77C\uC744 \uC720\uC9C0\uD558\uB418 \uD45C\uD604\uC740 \uB2E4\uC591\uD558\uAC8C \uBCC0\uC8FC
6. contentType: weekly_ranking / recommendation / genre / review \uC911 \uC120\uD0DD

\uB2E4\uB978 \uC124\uBA85, \uAC80\uC0C9 \uACFC\uC815 \uC124\uBA85, \uCD9C\uCC98 \uD45C\uAE30 \uC5C6\uC774 \uC544\uB798 JSON \uBC30\uC5F4 \uD615\uC2DD\uC73C\uB85C\uB9CC \uC751\uB2F5\uD558\uC138\uC694.
\uB9C8\uD06C\uB2E4\uC6B4 \uCF54\uB4DC\uBE14\uB85D(\`\`\`) \uC5C6\uC774 \uC21C\uC218 JSON\uB9CC \uBC18\uD658\uD569\uB2C8\uB2E4:
[
  {
    "title": "\uBE14\uB85C\uADF8 \uC81C\uBAA9",
    "topic": "\uD55C \uC904 \uC8FC\uC81C \uC124\uBA85 (20\uC790 \uC774\uB0B4)",
    "contentType": "weekly_ranking"
  }
]`,S=await fetch(ft,{method:"POST",headers:{"Content-Type":"application/json","x-api-key":o,"anthropic-version":"2023-06-01"},body:JSON.stringify({model:"claude-haiku-4-5-20251001",max_tokens:1500,messages:[{role:"user",content:k}],tools:[{type:"web_search_20250305",name:"web_search",max_uses:3}]})});if(!S.ok){let O=await S.json().catch(()=>({}));throw new Error(O.error?.message||`Anthropic API \uC624\uB958: ${S.status}`)}let T=(((await S.json()).content||[]).filter(O=>O.type==="text").map(O=>O.text).join("").trim()||"[]").replace(/^```json\s*/i,"").replace(/^```\s*/,"").replace(/\s*```$/,"").trim(),D;try{D=JSON.parse(T)}catch{let O=T.match(/\[[\s\S]*\]/);if(O)try{D=JSON.parse(O[0])}catch{}}if(!D)throw new Error("AI \uC751\uB2F5\uC744 JSON\uC73C\uB85C \uD30C\uC2F1\uD560 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4. \uB2E4\uC2DC \uC2DC\uB3C4\uD574\uC8FC\uC138\uC694.");if(!Array.isArray(D))throw new Error("AI \uC751\uB2F5\uC774 \uBC30\uC5F4 \uD615\uC2DD\uC774 \uC544\uB2D9\uB2C8\uB2E4.");return D=D.filter(O=>O&&typeof O.title=="string"&&O.title.trim()).map(O=>({title:O.title.trim(),topic:O.topic?.trim()||"",contentType:O.contentType?.trim()||"weekly_ranking"})).slice(0,8),new Response(JSON.stringify({ok:!0,suggestions:D,rankingData:s,meta:{platform:u,weekLabel:g,topicType:c,categorySlot:l||"all",categoryLabel:l&&s.length===1?s[0].display_name:"\uC804\uCCB4",generatedAt:new Date().toISOString()}}),{headers:e})}catch(s){return new Response(JSON.stringify({ok:!1,error:s.message}),{status:500,headers:e})}}if(i.method==="POST"&&r==="/blog-gen"){if(!N(i,t))return new Response(JSON.stringify({ok:!1,error:"Unauthorized"}),{status:401,headers:e});let o=t.ANTHROPIC_API_KEY;if(!o)return new Response(JSON.stringify({ok:!1,error:"ANTHROPIC_API_KEY \uD658\uACBD \uBCC0\uC218\uAC00 \uC124\uC815\uB418\uC9C0 \uC54A\uC558\uC2B5\uB2C8\uB2E4. Cloudflare Workers \u2192 Settings \u2192 Variables and Secrets\uC5D0\uC11C \uB4F1\uB85D\uD574\uC8FC\uC138\uC694."}),{status:500,headers:e});let n;try{n=await i.json()}catch{return new Response(JSON.stringify({ok:!1,error:"\uC798\uBABB\uB41C \uC694\uCCAD \uD615\uC2DD\uC785\uB2C8\uB2E4."}),{status:400,headers:e})}let{platform:_="netflix",contentType:c="weekly_ranking",categorySlot:d="all",tone:s="friendly",useEmoji:a=!0,useRating:l=!0,useLink:p=!0,useSpoiler:u=!1,useHashtag:g=!0,extraRequest:m=""}=n;if(!x[_])return new Response(JSON.stringify({ok:!1,error:"\uC9C0\uC6D0\uD558\uC9C0 \uC54A\uB294 \uD50C\uB7AB\uD3FC\uC785\uB2C8\uB2E4."}),{status:400,headers:e});let E=d&&d!=="all"?d:null;try{let w=await V(_,t,E);if(w.length===0)return new Response(JSON.stringify({ok:!1,error:E?"\uC120\uD0DD\uD55C \uCE74\uD14C\uACE0\uB9AC\uC758 \uB7AD\uD0B9 \uB370\uC774\uD130\uAC00 \uC5C6\uC2B5\uB2C8\uB2E4. \uB2E4\uB978 \uCE74\uD14C\uACE0\uB9AC\uB97C \uC120\uD0DD\uD558\uAC70\uB098 '\uC804\uCCB4'\uB85C \uB2E4\uC2DC \uC2DC\uB3C4\uD574\uC8FC\uC138\uC694.":"\uB7AD\uD0B9 \uB370\uC774\uD130\uAC00 \uC5C6\uC2B5\uB2C8\uB2E4. \uD06C\uB864\uB9C1 \uC644\uB8CC \uD6C4 \uB2E4\uC2DC \uC2DC\uB3C4\uD558\uAC70\uB098, \uD398\uC774\uC9C0 \uCE74\uD14C\uACE0\uB9AC \uC124\uC815\uC5D0\uC11C OTT \uD398\uC774\uC9C0 \uB178\uCD9C \uC5EC\uBD80\uB97C \uD655\uC778\uD574\uC8FC\uC138\uC694."}),{status:404,headers:e});let y=Zt(w,_),k=gt(),S=x[_],R=w.length===1&&(w[0].display_name||"").includes("\uC601\uD654")?"\uC601\uD654":"\uB4DC\uB77C\uB9C8",b=!!(m&&m.trim()),T=b?m.trim():`${k} ${S} \u2014 ${mt[c]||mt.weekly_ranking}`,D=[];a||D.push("\uC774\uBAA8\uC9C0\uB97C \uC0AC\uC6A9\uD558\uC9C0 \uB9C8\uC138\uC694."),l&&D.push(`\uC624\uB728\uB791(${_t}) \uD3C9\uC810 \uC815\uBCF4\uB97C \uC790\uC5F0\uC2A4\uB7FD\uAC8C \uC5B8\uAE09\uD574\uC8FC\uC138\uC694.`),p&&D.push(`\uD3EC\uC2A4\uD305 \uC911\uAC04\uC774\uB098 \uB9C8\uC9C0\uB9C9\uC5D0 "${_t}" \uB9C1\uD06C\uB97C "\uC624\uB728\uB791\uC5D0\uC11C \uB354 \uBCF4\uAE30" \uD615\uD0DC\uB85C \uC790\uC5F0\uC2A4\uB7FD\uAC8C \uC0BD\uC785\uD574\uC8FC\uC138\uC694.`),u&&D.push("\uC2A4\uD3EC\uC77C\uB7EC \uC8FC\uC758 \uBB38\uAD6C\uAC00 \uD544\uC694\uD55C \uC791\uD488\uC5D0\uB294 \u26A0\uFE0F \uC2A4\uD3EC\uC8FC\uC758 \uB77C\uBCA8\uC744 \uB2EC\uC544\uC8FC\uC138\uC694."),g&&D.push(`\uD3EC\uC2A4\uD305 \uB9C8\uC9C0\uB9C9\uC5D0 \uB124\uC774\uBC84 \uBE14\uB85C\uADF8\uC6A9 \uD574\uC2DC\uD0DC\uADF8\uB97C 15\uAC1C \uC774\uC0C1 \uCD94\uAC00\uD574\uC8FC\uC138\uC694. (\uC608: #${S}${R}\uCD94\uCC9C #OTT\uCD94\uCC9C #${S}\uC21C\uC704 \uB4F1)`);let O=`\uB2F9\uC2E0\uC740 \uB124\uC774\uBC84 \uBE14\uB85C\uADF8\uC5D0 OTT \uCF58\uD150\uCE20 \uAE00\uC744 \uB9E4\uC77C \uC4F0\uB294 30\uB300 \uC9C1\uC7A5\uC778\uC785\uB2C8\uB2E4.
\uB4DC\uB77C\uB9C8\uB97C \uC9C4\uC9DC \uC88B\uC544\uD574\uC11C \uD1F4\uADFC \uD6C4\uC5D0 \uBCF4\uACE0, \uC8FC\uB9D0\uC5D0 \uBAB0\uC544\uBCF4\uACE0, \uB290\uB080 \uB300\uB85C \uC194\uC9C1\uD558\uAC8C \uC501\uB2C8\uB2E4.
${b?`\uC624\uB298 \uC4F8 \uAE00\uC758 \uC8FC\uC81C\uB294 \uC815\uD655\uD788 \uC774\uAC81\uB2C8\uB2E4: "${T}"
\uC774 \uC8FC\uC81C\uC5D0 \uB9DE\uAC8C \uAE00\uC744 \uC791\uC131\uD574\uC8FC\uC138\uC694. \uC544\uB798 \uB7AD\uD0B9 \uB370\uC774\uD130\uB294 \uCC38\uACE0\uC6A9 \uBCF4\uC870\uC790\uB8CC\uC77C \uBFD0\uC785\uB2C8\uB2E4 \u2014
\uC8FC\uC81C\uC640 \uC9C1\uC811 \uAD00\uB828\uB41C \uBD80\uBD84\uB9CC \uCC38\uACE0\uD558\uACE0, \uAD00\uB828 \uC5C6\uC73C\uBA74 \uBB34\uC2DC\uD558\uC138\uC694.`:"\uC544\uB798 \uB7AD\uD0B9 \uB370\uC774\uD130\uB97C \uBC14\uD0D5\uC73C\uB85C \uC9C0\uAE08 \uB2F9\uC7A5 \uC774 \uC0AC\uB78C\uC774 \uC4F8 \uAC83 \uAC19\uC740 \uBE14\uB85C\uADF8 \uAE00\uC744 \uC791\uC131\uD574\uC8FC\uC138\uC694."}

${y}

${b?`\uC8FC\uC81C("${T}")\uAC00 \uC704 \uB370\uC774\uD130\uB9CC\uC73C\uB85C\uB294 \uBD80\uC871\uD560 \uAC00\uB2A5\uC131\uC774 \uB192\uC2B5\uB2C8\uB2E4 \u2014 \uADF8\uB7F0 \uACBD\uC6B0
web_search\uB97C \uC5EC\uB7EC \uBC88 \uC0AC\uC6A9\uD574\uC11C \uC5B8\uB860 \uBCF4\uB3C4\xB7\uD654\uC81C\uC131\xB7\uACF5\uAC1C \uC2DC\uAE30\xB7\uC2DC\uC98C \uAC31\uC2E0 \uC5EC\uBD80 \uAC19\uC740 \uB2E8\uC11C\uB4E4\uC744
\uCDA9\uBD84\uD788 \uBAA8\uC740 \uB4A4, \uADF8\uAC78 \uADFC\uAC70\uB85C \uC21C\uC704\xB7\uCD94\uCC9C \uB9AC\uC2A4\uD2B8\uB97C \uB2F9\uB2F9\uD558\uAC8C \uB9CC\uB4E4\uC5B4\uB0B4\uC138\uC694. "\uC815\uD655\uD55C \uACF5\uC2DD
\uC218\uCE58\uAC00 \uC5C6\uB2E4"\uB294 \uC2DD\uC73C\uB85C \uBC1C\uBE8C\uD558\uAC70\uB098 \uC560\uB9E4\uD558\uAC8C \uC5BC\uBC84\uBB34\uB9AC\uC9C0 \uB9D0\uACE0, \uC2E4\uC81C OTT \uBE14\uB85C\uAC70\uAC00 \uC4F0\uB4EF
\uC790\uC5F0\uC2A4\uB7FD\uAC8C \uB2E8\uC815\uD574\uC11C \uC4F0\uC138\uC694. \uB2E8, \uAC80\uC0C9 \uACB0\uACFC \uBB38\uC7A5\uC744 \uADF8\uB300\uB85C \uBCA0\uB07C\uC9C0 \uB9D0\uACE0 \uB124\uC774\uBC84 \uBE14\uB85C\uAC70
\uB9D0\uD22C\uB85C \uC9C1\uC811 \uB2E4\uC2DC \uC368\uC57C \uD569\uB2C8\uB2E4.
\uC774 \uC8FC\uC81C\uB294 \uC0AC\uC6A9\uC790\uAC00 \uC9C1\uC811 \uC9C0\uC815\uD55C \uB9CC\uD07C \uAE00\uC758 \uD575\uC2EC\uC785\uB2C8\uB2E4. \uC21C\uC704\xB7\uCD94\uCC9C \uD56D\uBAA9\uC744 \uB2E4\uB8F0 \uB54C\uB294
"1\uC704. \uC791\uD488\uBA85" \uC2DD\uC73C\uB85C \uC21C\uBC88\uACFC \uC815\uD655\uD55C \uC791\uD488\uBA85\uC744 \uB610\uB837\uD558\uAC8C \uBC1D\uD788\uACE0, \uBC14\uB85C \uC606\uC774\uB098 \uB2E4\uC74C \uC904\uC5D0
\uD654\uC81C\uC131\xB7\uD765\uD589\uB3C4\uB97C \uC9E7\uAC8C\uB77C\uB3C4 \uD45C\uC2DC\uD574\uC8FC\uC138\uC694 (\uC608: "\uD654\uC81C\uC131 \u2605\u2605\u2605\u2605\u2606", "\uD765\uD589\uB3C4 \uB9E4\uC6B0 \uB192\uC74C" \uB4F1).
\uBAA8\uD638\uD558\uAC8C \uBB49\uB6B1\uADF8\uB9AC\uC9C0 \uB9D0\uACE0, \uD56D\uBAA9 \uD558\uB098\uD558\uB098\uB97C \uAD6C\uCCB4\uC801\uC73C\uB85C \uCC44\uC6CC\uC11C \uD55C\uB208\uC5D0 \uBE44\uAD50\uB418\uAC8C \uC368\uC8FC\uC138\uC694.`:`\uC774 \uB370\uC774\uD130\uC5D0 \uC5C6\uB294 \uC8FC\uC81C(\uC608: \uB2E4\uC74C \uB2EC \uACF5\uAC1C \uC608\uC815 \uC2E0\uC791, \uC774\uBC88 \uBD84\uAE30\xB7\uBC18\uAE30 \uACB0\uC0B0, \uB370\uC774\uD130\uC5D0 \uC544\uC9C1
\uC548 \uC7A1\uD78C \uCD5C\uC2E0 \uD654\uC81C\uC791\xB7\uC774\uC288 \uB4F1)\uB97C \uB2E4\uB904\uC57C \uD55C\uB2E4\uBA74, web_search\uB97C \uC5EC\uB7EC \uBC88 \uC0AC\uC6A9\uD574\uC11C \uC5B8\uB860 \uBCF4\uB3C4\xB7
\uD654\uC81C\uC131\xB7\uACF5\uAC1C \uC2DC\uAE30\xB7\uC2DC\uC98C \uAC31\uC2E0 \uC5EC\uBD80 \uAC19\uC740 \uB2E8\uC11C\uB4E4\uC744 \uCDA9\uBD84\uD788 \uBAA8\uC740 \uB4A4, \uADF8\uAC78 \uADFC\uAC70\uB85C \uC21C\uC704\xB7\uCD94\uCC9C
\uB9AC\uC2A4\uD2B8\uB97C \uB2F9\uB2F9\uD558\uAC8C \uB9CC\uB4E4\uC5B4\uB0B4\uC138\uC694. "\uC815\uD655\uD55C \uACF5\uC2DD \uC218\uCE58\uAC00 \uC5C6\uB2E4"\uB294 \uC2DD\uC73C\uB85C \uBC1C\uBE8C\uD558\uAC70\uB098 \uC560\uB9E4\uD558\uAC8C
\uC5BC\uBC84\uBB34\uB9AC\uC9C0 \uB9D0\uACE0, \uC2E4\uC81C OTT \uBE14\uB85C\uAC70\uAC00 \uC4F0\uB4EF \uC790\uC5F0\uC2A4\uB7FD\uAC8C \uB2E8\uC815\uD574\uC11C \uC4F0\uC138\uC694. \uB2E8, \uAC80\uC0C9 \uACB0\uACFC \uBB38\uC7A5\uC744
\uADF8\uB300\uB85C \uBCA0\uB07C\uC9C0 \uB9D0\uACE0 \uB124\uC774\uBC84 \uBE14\uB85C\uAC70 \uB9D0\uD22C\uB85C \uC9C1\uC811 \uB2E4\uC2DC \uC368\uC57C \uD569\uB2C8\uB2E4.`}

\u2501\u2501\u2501 \uC791\uC131 \uC870\uAC74 \u2501\u2501\u2501
\uC8FC\uC81C: ${T}
\uB9D0\uD22C: ${pt[s]||pt.friendly}
\uAE38\uC774: 1500\uC790~2500\uC790
\uAD6C\uC870: [\uC81C\uBAA9] \u2192 \uB3C4\uC785\uBD80 \u2192 \uBCF8\uBB38 \u2192 \uB9C8\uBB34\uB9AC
${c==="weekly_ranking"?w.length>1?"\uC21C\uC704 \uB098\uC5F4: \uCE74\uD14C\uACE0\uB9AC\uBCC4\uB85C \uC139\uC158\uC744 \uB098\uB220\uC11C \uAC01\uAC01 10\uC704\u21921\uC704 \uC5ED\uC21C\uC73C\uB85C \uC791\uC131 (\uC11C\uB85C \uB2E4\uB978 \uCE74\uD14C\uACE0\uB9AC\uB97C \uD558\uB098\uC758 \uC21C\uC704 \uB9AC\uC2A4\uD2B8\uB85C \uD569\uCE58\uC9C0 \uB9D0 \uAC83)":"\uC21C\uC704 \uB098\uC5F4: 10\uC704\u21921\uC704 \uC5ED\uC21C (\uB05D\uAE4C\uC9C0 \uC77D\uAC8C \uC720\uB3C4)":""}

\u2501\u2501\u2501 \uC808\uB300 \uC4F0\uC9C0 \uB9D0\uC544\uC57C \uD560 AI \uD45C\uD604 \u2501\u2501\u2501
\uAE08\uC9C0 \uB2E8\uC5B4/\uD45C\uD604:
- "~\uC0B4\uD3B4\uBCF4\uACA0\uC2B5\uB2C8\uB2E4" "~\uC54C\uC544\uBCF4\uACA0\uC2B5\uB2C8\uB2E4" "~\uC18C\uAC1C\uD574\uB4DC\uB9AC\uACA0\uC2B5\uB2C8\uB2E4"
- "\uC548\uB155\uD558\uC138\uC694, [\uBE14\uB85C\uADF8\uBA85]\uC785\uB2C8\uB2E4"\uB85C \uC2DC\uC791\uD558\uB294 \uC778\uC0AC
- "\uC5EC\uB7EC\uBD84" "\uB3C5\uC790 \uC5EC\uB7EC\uBD84" \uD638\uCE6D
- "\uC774\uC0C1\uC73C\uB85C ~\uB97C \uB9C8\uCE58\uACA0\uC2B5\uB2C8\uB2E4" \uC2DD\uC758 \uB9C8\uBB34\uB9AC
- "~\uB77C\uACE0 \uD560 \uC218 \uC788\uC2B5\uB2C8\uB2E4" "~\uB77C\uACE0 \uBCFC \uC218 \uC788\uC2B5\uB2C8\uB2E4" \uAC19\uC740 \uC644\uACE1 \uD45C\uD604
- "\uC815\uB9D0", "\uB9E4\uC6B0", "\uAD49\uC7A5\uD788"\uC758 \uACFC\uB3C4\uD55C \uBC18\uBCF5
- \uC18C\uC81C\uBAA9\uC5D0 \u2605, \u25A0, \u25C6 \uAC19\uC740 \uD2B9\uC218\uAE30\uD638 \uB0A8\uBC1C
- \uB9C8\uD06C\uB2E4\uC6B4 ##, **, --- \uAE30\uD638

\u2501\u2501\u2501 \uC2E4\uC81C \uB124\uC774\uBC84 \uBE14\uB85C\uADF8 \uAE00 \uAD6C\uC870 \uC608\uC2DC (\uBB38\uC7A5 \uC2A4\uD0C0\uC77C\xB7\uC904\uBC14\uAFC8 \uD615\uC2DD\uB9CC \uCC38\uACE0\uD558\uC138\uC694 \u2014 \uC544\uB798 \uC608\uC2DC \uC18D \uC18C\uC7AC\uB294 \uC2E4\uC81C \uC8FC\uC81C\uC640 \uBB34\uAD00\uD569\uB2C8\uB2E4) \u2501\u2501\u2501

\uB124\uC774\uBC84 \uBE14\uB85C\uADF8\uB294 \uC544\uB798\uCC98\uB7FC \uC9E7\uC740 \uBB38\uC7A5\uC744 \uD55C \uC904\uC529 \uC904\uBC14\uAFC8\uD574\uC11C \uC501\uB2C8\uB2E4.
\uBB38\uB2E8\uC744 \uAE38\uAC8C \uC4F0\uC9C0 \uC54A\uACE0, \uC228 \uC26C\uB4EF \uB04A\uC5B4\uC11C \uC501\uB2C8\uB2E4.

[\uB3C4\uC785\uBD80 \uC608\uC2DC \u2014 \uC774\uB807\uAC8C \uC2DC\uC791\uD574\uC57C \uD568]
\uC548\uB155\uD558\uC138\uC694, \uAE40\uC791\uC785\uB2C8\uB2E4

\uB4DC\uB77C\uB9C8 \uB9AC\uBDF0\uC5B4\uB85C\uC11C
\uAC00\uC7A5 \uAE30\uBD84\uC774 \uC88B\uC744 \uB54C\uB294
\uBCFC\uB9CC\uD55C \uB4DC\uB77C\uB9C8\uAC00 \uB9CE\uC744 \uB54C\uC778\uB370\uC694

\uC694\uC998 \uB137\uD50C\uB9AD\uC2A4\uB97C \uCF1C\uBA74
\uB531 \uADF8\uB7F0 \uAE30\uBD84\uC774 \uB4E4\uB354\uB77C\uACE0\uC694
\uB2E4\uCC44\uB85C\uC6B4 \uC791\uD488\uB4E4\uC774 \uB9CE\uC544\uC11C \uB9D0\uC774\uC8E0

\uB2E4\uAC00\uC624\uB294 \uC5F0\uD734
\uAC01\uC7A1\uACE0 \uBAB0\uC544\uBCF4\uAE30 \uCD5C\uACE0\uB77C \uC0DD\uAC01\uB418\uB294
\uC694\uC998 \uD56B\uD55C \uB137\uD50C\uB9AD\uC2A4 \uB4DC\uB77C\uB9C8\uB4E4!
1\uC704\uBD80\uD130 5\uC704\uAE4C\uC9C0 \uC54C\uC544\uBD05\uB2C8\uB2E4

---

[\uC791\uD488 \uC18C\uAC1C \uC608\uC2DC \u2014 \uC774\uB807\uAC8C \uC500]
1\uC704. \uAE40\uBD80\uC7A5

\uC800\uB3C4 \uC5B4\uC81C 1\uD654 \uBD24\uAC70\uB4E0\uC694
\uCC98\uC74C\uC5D4 \uADF8\uB0E5 \uBCFC\uAE4C \uD588\uB294\uB370
\uD55C \uD654 \uBCF4\uACE0 \uBC14\uB85C \uB2E4\uC74C \uD654 \uB20C\uB800\uC5B4\uC694

\uC804\uAC1C\uAC00 \uBE60\uB974\uACE0
\uC8FC\uC778\uACF5 \uCE90\uB9AD\uD130\uAC00 \uD655\uC2E4\uD574\uC11C
\uBAB0\uC785\uC774 \uC798 \uB3FC\uC694

---

[\uB9C8\uBB34\uB9AC \uC608\uC2DC]
\uC774\uBC88 \uC8FC \uC21C\uC704\uB294 \uC5EC\uAE30\uAE4C\uC9C0\uC608\uC694

\uB2E4\uC74C \uC8FC\uC5D0 \uB610 \uC5C5\uB370\uC774\uD2B8\uB418\uBA74 \uBC14\uB85C \uC62C\uAC8C\uC694
\uBCF4\uACE0 \uC2F6\uC740 \uAC70 \uC788\uC73C\uBA74 \uB313\uAE00\uB85C \uC54C\uB824\uC8FC\uC138\uC694!

\u2501\u2501\u2501 \uD575\uC2EC \uD615\uC2DD \uADDC\uCE59 \u2501\u2501\u2501
- \uD55C \uBB38\uC7A5 = \uD55C \uC904. \uC808\uB300 \uAE38\uAC8C \uBD99\uC5EC \uC4F0\uC9C0 \uC54A\uC74C
- \uB3C4\uC785\uBD80\uB294 \uBC18\uB4DC\uC2DC \uBCF8\uC778 \uC598\uAE30 \uB610\uB294 \uAC10\uC815\uC73C\uB85C \uC2DC\uC791 (\uC815\uBCF4 \uB098\uC5F4\uB85C \uC2DC\uC791 \uAE08\uC9C0)
- \uC791\uD488\uB9C8\uB2E4 \uBC88\uD638 + \uC81C\uBAA9 \u2192 \uC904\uBC14\uAFC8 \u2192 \uC9E7\uC740 \uAC10\uC0C1 3~5\uC904
- \uB9C8\uBB34\uB9AC\uB294 \uC9E7\uACE0 \uCE5C\uADFC\uD558\uAC8C, "\uB2E4\uC74C\uC5D0 \uB610 \uC62C\uAC8C\uC694" \uC2DD\uC73C\uB85C
\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501

${D.length>0?`[\uCD94\uAC00 \uC9C0\uC2DC\uC0AC\uD56D]
`+D.map((C,I)=>`${I+1}. ${C}`).join(`
`):""}

\uB9C8\uD06C\uB2E4\uC6B4 \uAE30\uD638 \uC5C6\uC774 \uC77C\uBC18 \uD14D\uC2A4\uD2B8\uB85C, \uB2E8\uB77D \uAD6C\uBD84\uC740 \uBE48 \uC904\uB85C\uB9CC \uD574\uC8FC\uC138\uC694.`,h=await vt(O,o,{useWebSearch:b,maxTokens:b?5e3:4096});if(!h)throw new Error("AI \uC751\uB2F5\uC774 \uBE44\uC5B4\uC788\uC2B5\uB2C8\uB2E4. \uB2E4\uC2DC \uC2DC\uB3C4\uD574\uC8FC\uC138\uC694.");return new Response(JSON.stringify({ok:!0,post:h,rankingData:w,meta:{platform:_,platformName:S,weekInfo:k,categorySlot:E||"all",categoryLabel:E&&w.length===1?w[0].display_name:"\uC804\uCCB4",generatedAt:new Date().toISOString()}}),{headers:e})}catch(w){return new Response(JSON.stringify({ok:!1,error:w.message}),{status:500,headers:e})}}return null}var qt=["ad","bug"],te=["pending","answered","resolved"],ee=5,wt=30;async function kt(r,i,t,f,e,o){if(r==="/inquiry"&&i.method==="POST")try{let c=await i.json(),{type:d,name:s,email:a,phone:l,title:p,content:u,page_url:g,website:m}=c;if(m)return new Response(JSON.stringify({ok:!0}),{headers:o});if(!qt.includes(d))return new Response(JSON.stringify({ok:!1,message:"type\uC740 ad \uB610\uB294 bug\uC5EC\uC57C \uD569\uB2C8\uB2E4"}),{status:400,headers:o});if(!p||!p.trim()||!u||!u.trim())return new Response(JSON.stringify({ok:!1,message:"\uC81C\uBAA9\uACFC \uB0B4\uC6A9\uC740 \uD544\uC218\uC785\uB2C8\uB2E4"}),{status:400,headers:o});if(d==="ad"){if(!s||!s.trim())return new Response(JSON.stringify({ok:!1,message:"\uB2F4\uB2F9\uC790\uBA85 \uB610\uB294 \uC5C5\uCCB4\uBA85\uC744 \uC785\uB825\uD574\uC8FC\uC138\uC694"}),{status:400,headers:o});if(!a||!a.trim())return new Response(JSON.stringify({ok:!1,message:"\uC774\uBA54\uC77C\uC744 \uC785\uB825\uD574\uC8FC\uC138\uC694"}),{status:400,headers:o})}if(a&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(a))return new Response(JSON.stringify({ok:!1,message:"\uC774\uBA54\uC77C \uD615\uC2DD\uC774 \uC62C\uBC14\uB974\uC9C0 \uC54A\uC2B5\uB2C8\uB2E4"}),{status:400,headers:o});let E=d,w=String(p).slice(0,200),y=String(u).slice(0,5e3),k=s?String(s).slice(0,100):null,S=a?String(a).slice(0,200):null,R=l?String(l).slice(0,30):null,b=g?String(g).slice(0,500):null,T=i.headers.get("User-Agent")||null,D=i.headers.get("CF-Connecting-IP")||null,O=null;try{let h=i.headers.get("Authorization")||"",I=(h.startsWith("Bearer ")?h.slice(7).trim():null)||L(i);if(I){let J=await t.DB.prepare("SELECT user_id AS id FROM sessions WHERE id = ? LIMIT 1").bind(I).first();J&&(O=J.id)}}catch{}return D&&((await t.DB.prepare(`SELECT COUNT(*) as cnt FROM inquiries
           WHERE ip_address = ? AND created_at > datetime('now', '-1 hour')`).bind(D).first())?.cnt||0)>=ee&&await t.DB.prepare(`SELECT id FROM inquiries
             WHERE ip_address = ? AND created_at > datetime('now', '-${wt} seconds')
             LIMIT 1`).bind(D).first()?new Response(JSON.stringify({ok:!1,message:`\uC9E7\uC740 \uC2DC\uAC04\uC5D0 \uB108\uBB34 \uB9CE\uC774 \uC81C\uCD9C\uB410\uC5B4\uC694. ${wt}\uCD08 \uD6C4 \uB2E4\uC2DC \uC2DC\uB3C4\uD574\uC8FC\uC138\uC694.`}),{status:429,headers:o}):(await t.DB.prepare(`
        INSERT INTO inquiries (
          type, name, email, phone, title, content, page_url,
          user_agent, ip_address, user_id, status, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', datetime('now'), datetime('now'))
      `).bind(E,k,S,R,w,y,b,T,D,O).run(),new Response(JSON.stringify({ok:!0}),{headers:o}))}catch(c){return new Response(JSON.stringify({ok:!1,message:c.message}),{status:500,headers:o})}let n=r.match(/^\/admin\/inquiry\/(\d+)$/);if(i.method==="DELETE"&&n){if(i.headers.get("Authorization")!==`Bearer ${t.ADMIN_SECRET}`)return new Response(JSON.stringify({ok:!1,message:"Unauthorized"}),{status:401,headers:o});try{return await t.DB.prepare("DELETE FROM inquiries WHERE id = ?").bind(n[1]).run(),new Response(JSON.stringify({ok:!0}),{headers:o})}catch(c){return new Response(JSON.stringify({ok:!1,message:c.message}),{status:500,headers:o})}}let _=r.match(/^\/admin\/inquiry\/(\d+)$/);if(i.method==="PATCH"&&_){if(i.headers.get("Authorization")!==`Bearer ${t.ADMIN_SECRET}`)return new Response(JSON.stringify({ok:!1,message:"Unauthorized"}),{status:401,headers:o});try{let c=await i.json(),{status:d,admin_reply:s}=c;return d&&!te.includes(d)?new Response(JSON.stringify({ok:!1,message:"status \uAC12\uC774 \uC62C\uBC14\uB974\uC9C0 \uC54A\uC2B5\uB2C8\uB2E4"}),{status:400,headers:o}):await t.DB.prepare("SELECT id FROM inquiries WHERE id = ?").bind(_[1]).first()?(await t.DB.prepare(`
        UPDATE inquiries
        SET status      = COALESCE(?, status),
            admin_reply = COALESCE(?, admin_reply),
            updated_at  = datetime('now')
        WHERE id = ?
      `).bind(d||null,s??null,_[1]).run(),new Response(JSON.stringify({ok:!0}),{headers:o})):new Response(JSON.stringify({ok:!1,message:"\uCC3E\uC744 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4"}),{status:404,headers:o})}catch(c){return new Response(JSON.stringify({ok:!1,message:c.message}),{status:500,headers:o})}}if(r==="/admin/inquiry"&&i.method==="GET"){if(i.headers.get("Authorization")!==`Bearer ${t.ADMIN_SECRET}`)return new Response(JSON.stringify({ok:!1,message:"Unauthorized"}),{status:401,headers:o});try{let c=e.searchParams.get("type")||"all",d=e.searchParams.get("status")||"all",s=Math.min(parseInt(e.searchParams.get("limit")||"50"),100),a=Math.max(parseInt(e.searchParams.get("offset")||"0"),0),l=[],p=[];c!=="all"&&(l.push("type = ?"),p.push(c)),d!=="all"&&(l.push("status = ?"),p.push(d));let u=l.length?`WHERE ${l.join(" AND ")}`:"",[g,m]=await t.DB.batch([t.DB.prepare(`SELECT * FROM inquiries ${u} ORDER BY created_at DESC LIMIT ? OFFSET ?`).bind(...p,s,a),t.DB.prepare(`SELECT COUNT(*) as cnt FROM inquiries ${u}`).bind(...p)]),E=g.results||[],w=m.results?.[0]?.cnt||0;return new Response(JSON.stringify({ok:!0,data:E,total:w}),{headers:o})}catch(c){return new Response(JSON.stringify({ok:!1,message:c.message}),{status:500,headers:o})}}return null}async function se(r,i,t){let f=i?[i]:["tv","movie"],e=!1;for(let o of f)try{let n=await fetch(`https://api.themoviedb.org/3/${o}/${r}/images?api_key=${t.TMDB_API_KEY}`);if(!n.ok)continue;e=!0;let c=(await n.json()).logos||[],d=c.find(s=>s.iso_639_1==="ko")||c.find(s=>!s.iso_639_1)||null;if(d)return{ok:!0,logoPath:d.file_path}}catch{}return{ok:e,logoPath:null}}async function yt(r,i){let{results:t}=await r.DB.prepare(`SELECT w.tmdb_id, w.media_type
     FROM hot100_scores h
     JOIN works w ON w.tmdb_id = h.tmdb_id
     WHERE COALESCE(w.hero_title_baked_in, 0) = 0
       AND w.hero_logo_checked_at IS NULL
     LIMIT ?`).bind(i).all();if(!t||t.length===0)return{processed:0,found:0,failed:0};let f=new Date(Date.now()+540*60*1e3).toISOString().slice(0,19).replace("T"," "),e=0,o=0,n=[];for(let _ of t){let c=await se(_.tmdb_id,_.media_type||null,r);if(!c.ok){o++;continue}c.logoPath&&e++,n.push(r.DB.prepare("UPDATE works SET hero_logo_path = ?, hero_logo_checked_at = ? WHERE tmdb_id = ?").bind(c.logoPath,f,_.tmdb_id))}return n.length>0&&await r.DB.batch(n),{processed:n.length,found:e,failed:o}}async function Rt(r,i,t){if(!await N(r,i))return new Response(JSON.stringify({ok:!1,error:"\uAD00\uB9AC\uC790 \uC778\uC99D\uC774 \uD544\uC694\uD569\uB2C8\uB2E4."}),{status:401,headers:t});try{let e=await i.DB.prepare("SELECT value AS latest_date FROM app_settings WHERE key = 'latest_ranking_date'").first();if(!e||!e.latest_date)return new Response(JSON.stringify({ok:!1,error:"rankings \uD14C\uC774\uBE14\uC5D0 \uC720\uD6A8\uD55C \uD06C\uB864\uB9C1 \uB370\uC774\uD130\uAC00 \uC5C6\uC2B5\uB2C8\uB2E4."}),{status:404,headers:t});let o=e.latest_date,n=`
      WITH target_rankings AS (
        SELECT r.tmdb_id, r.platform, r.rank, r.title_ko,
               COALESCE(oc.hot100_weight, 0.5) AS category_weight
        FROM rankings r
        JOIN ott_categories oc
          ON oc.platform = r.platform
         AND oc.category_slot = r.category_slot
        WHERE r.tmdb_id IS NOT NULL
          AND r.date = ?
          AND oc.hot100_eligible = 1
      ),
      weighted AS (
        SELECT
          tr.tmdb_id,
          tr.platform,
          tr.rank,
          tr.title_ko,
          CASE WHEN tr.rank <= 20 THEN (100 - (tr.rank - 1) * 5) ELSE 0 END AS rank_score,
          tr.category_weight AS platform_weight,
          CASE WHEN tr.rank <= 20 THEN (100 - (tr.rank - 1) * 5) ELSE 0 END
            * tr.category_weight AS weighted_score,
          ROW_NUMBER() OVER (
            PARTITION BY tr.tmdb_id
            ORDER BY
              (CASE WHEN tr.rank <= 20 THEN (100 - (tr.rank - 1) * 5) ELSE 0 END)
              * tr.category_weight DESC
          ) AS rn
        FROM target_rankings tr
      )
      SELECT
        w.tmdb_id,
        w.platform AS best_platform,
        w.rank AS best_rank,
        w.rank_score,
        w.platform_weight,
        w.weighted_score,
        COALESCE(ab.boost_value, 0) AS admin_boost
      FROM weighted w
      LEFT JOIN admin_boosts ab ON ab.tmdb_id = w.tmdb_id
      WHERE w.rn = 1
      ORDER BY (w.weighted_score + COALESCE(ab.boost_value, 0)) DESC
    `,{results:_}=await i.DB.prepare(n).bind(o).all(),{results:c}=await i.DB.prepare("SELECT tmdb_id, boost_value, is_pinned, pinned_score, pinned_platform FROM admin_boosts").all(),d=new Map((c||[]).map(E=>[E.tmdb_id,E]));if((!_||_.length===0)&&d.size===0)return new Response(JSON.stringify({ok:!1,error:"\uACC4\uC0B0\uD560 \uB7AD\uD0B9 \uB370\uC774\uD130\uAC00 \uC5C6\uC2B5\uB2C8\uB2E4."}),{status:404,headers:t});let s=[],a=new Set;for(let E of _||[]){a.add(E.tmdb_id);let w=d.get(E.tmdb_id);w&&w.is_pinned?s.push({tmdb_id:E.tmdb_id,best_platform:w.pinned_platform||E.best_platform,best_rank:E.best_rank,rank_score:0,platform_weight:0,weighted_score:0,admin_boost:w.pinned_score??0}):s.push(E)}for(let[E,w]of d)a.has(E)||(w.is_pinned?s.push({tmdb_id:E,best_platform:w.pinned_platform||"manual",best_rank:null,rank_score:0,platform_weight:0,weighted_score:0,admin_boost:w.pinned_score??0}):w.boost_value&&s.push({tmdb_id:E,best_platform:w.pinned_platform||"manual",best_rank:null,rank_score:0,platform_weight:0,weighted_score:0,admin_boost:w.boost_value}));s.sort((E,w)=>w.weighted_score+w.admin_boost-(E.weighted_score+E.admin_boost));let l=new Date(Date.now()+540*60*1e3).toISOString().slice(0,19).replace("T"," "),p=[i.DB.prepare("DELETE FROM hot100_scores")];for(let E of s){let w=E.weighted_score+E.admin_boost;p.push(i.DB.prepare(`INSERT INTO hot100_scores
            (tmdb_id, calc_date, best_platform, platform_weight,
             rank_score, weighted_rank_score, engagement_score,
             admin_boost, total_score, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?, ?)`).bind(E.tmdb_id,o,E.best_platform,E.platform_weight,E.rank_score,E.weighted_score,E.admin_boost,w,l))}await i.DB.batch(p);let u=s.filter(E=>E.best_platform==="netflix").slice(0,20),g=0;if(u.length>0){let E=u.map(R=>R.tmdb_id),w=E.map(()=>"?").join(","),{results:y}=await i.DB.prepare(`SELECT tmdb_id, title_ko, title_en, poster_path, genre, tmdb_rating, release_year
         FROM works WHERE tmdb_id IN (${w})`).bind(...E).all(),k=new Map((y||[]).map(R=>[R.tmdb_id,R])),S=[i.DB.prepare("DELETE FROM rankings WHERE platform = 'netflix' AND category_slot = 'category10' AND date = ?").bind(o)];u.forEach((R,b)=>{let T=k.get(R.tmdb_id)||{};S.push(i.DB.prepare(`INSERT INTO rankings
              (platform, category_slot, category, date, rank, tmdb_id,
               title_ko, title_en, poster_path, release_year, genre, tmdb_rating,
               is_manual, source_name)
             VALUES ('netflix', 'category10', 'category10', ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 'HOT100 \uAE30\uBC18 \uD1B5\uD569\uB7AD\uD0B9')`).bind(o,b+1,R.tmdb_id,T.title_ko||"",T.title_en||"",T.poster_path||null,T.release_year||null,T.genre||null,T.tmdb_rating||null))}),await i.DB.batch(S),g=u.length}let m={processed:0,found:0,failed:0};try{m=await yt(i,20)}catch(E){console.error("calcHot100 \uB85C\uACE0 \uBC31\uD544 \uC624\uB958:",E)}return new Response(JSON.stringify({ok:!0,netflix_overall_saved:g,calc_date:o,total_works:s.length,hero_logo_backfill:m,top10_preview:s.slice(0,10).map(E=>({tmdb_id:E.tmdb_id,best_platform:E.best_platform,best_rank:E.best_rank,total_score:E.weighted_score+E.admin_boost}))}),{status:200,headers:t})}catch(e){return console.error("calcHot100 \uC624\uB958:",e),new Response(JSON.stringify({ok:!1,error:"HOT100 \uACC4\uC0B0 \uC911 \uC624\uB958\uAC00 \uBC1C\uC0DD\uD588\uC2B5\uB2C8\uB2E4.",detail:e.message}),{status:500,headers:t})}}async function St(r,i,t){if(!await N(r,i))return new Response(JSON.stringify({ok:!1,error:"\uAD00\uB9AC\uC790 \uC778\uC99D\uC774 \uD544\uC694\uD569\uB2C8\uB2E4."}),{status:401,headers:t});try{let{results:e}=await i.DB.prepare(`SELECT ab.tmdb_id, ab.boost_value, ab.reason, ab.is_pinned, ab.pinned_score, ab.pinned_platform, ab.updated_at,
              w.title_ko, w.poster_path
       FROM admin_boosts ab
       LEFT JOIN works w ON w.tmdb_id = ab.tmdb_id
       ORDER BY ab.updated_at DESC`).all();return new Response(JSON.stringify({ok:!0,data:e||[]}),{status:200,headers:t})}catch(e){return new Response(JSON.stringify({ok:!1,error:e.message}),{status:500,headers:t})}}async function Ot(r,i,t){if(!await N(r,i))return new Response(JSON.stringify({ok:!1,error:"\uAD00\uB9AC\uC790 \uC778\uC99D\uC774 \uD544\uC694\uD569\uB2C8\uB2E4."}),{status:401,headers:t});try{let o=(new URL(r.url).searchParams.get("q")||"").trim();if(!o)return new Response(JSON.stringify({ok:!0,data:[]}),{status:200,headers:t});let{results:n}=await i.DB.prepare(`SELECT w.tmdb_id, w.title_ko, w.title_en, w.poster_path,
              COALESCE(ab.boost_value, 0) AS boost_value,
              COALESCE(ab.is_pinned, 0) AS is_pinned,
              ab.pinned_score,
              ab.pinned_platform
       FROM works w
       LEFT JOIN admin_boosts ab ON ab.tmdb_id = w.tmdb_id
       WHERE w.title_ko LIKE ? OR w.title_en LIKE ? OR w.tmdb_id = ?
       ORDER BY w.tmdb_id DESC
       LIMIT 20`).bind(`%${o}%`,`%${o}%`,parseInt(o,10)||0).all();return new Response(JSON.stringify({ok:!0,data:n||[]}),{status:200,headers:t})}catch(e){return new Response(JSON.stringify({ok:!1,error:e.message}),{status:500,headers:t})}}async function bt(r,i,t){if(!await N(r,i))return new Response(JSON.stringify({ok:!1,error:"\uAD00\uB9AC\uC790 \uC778\uC99D\uC774 \uD544\uC694\uD569\uB2C8\uB2E4."}),{status:401,headers:t});try{let e=await r.json(),{tmdb_id:o,boost_value:n,reason:_,is_pinned:c,pinned_score:d,pinned_platform:s}=e;if(!o)return new Response(JSON.stringify({ok:!1,error:"tmdb_id\uAC00 \uD544\uC694\uD569\uB2C8\uB2E4."}),{status:400,headers:t});let a=w=>Object.prototype.hasOwnProperty.call(e,w),l=null;(!a("boost_value")||!a("is_pinned")||!a("pinned_score")||!a("pinned_platform"))&&(l=await i.DB.prepare("SELECT boost_value, is_pinned, pinned_score, pinned_platform FROM admin_boosts WHERE tmdb_id = ?").bind(o).first());let p=a("boost_value")?n||0:l?.boost_value??0,u=a("is_pinned")?c?1:0:l?.is_pinned||0,g=a("pinned_score")?d??0:l?.pinned_score??null,m=a("pinned_platform")?s||null:l?.pinned_platform??null,E=new Date(Date.now()+540*60*1e3).toISOString().slice(0,19).replace("T"," ");return await i.DB.prepare(`INSERT INTO admin_boosts (tmdb_id, boost_value, reason, is_pinned, pinned_score, pinned_platform, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(tmdb_id) DO UPDATE SET
         boost_value = excluded.boost_value,
         reason = excluded.reason,
         is_pinned = excluded.is_pinned,
         pinned_score = excluded.pinned_score,
         pinned_platform = excluded.pinned_platform,
         updated_at = excluded.updated_at`).bind(o,p,_||null,u,g,m,E).run(),new Response(JSON.stringify({ok:!0}),{status:200,headers:t})}catch(e){return new Response(JSON.stringify({ok:!1,error:e.message}),{status:500,headers:t})}}async function Nt(r,i,t,f){if(!await N(i,t))return new Response(JSON.stringify({ok:!1,error:"\uAD00\uB9AC\uC790 \uC778\uC99D\uC774 \uD544\uC694\uD569\uB2C8\uB2E4."}),{status:401,headers:f});try{return await t.DB.prepare("DELETE FROM admin_boosts WHERE tmdb_id = ?").bind(r).run(),new Response(JSON.stringify({ok:!0}),{status:200,headers:f})}catch(o){return new Response(JSON.stringify({ok:!1,error:o.message}),{status:500,headers:f})}}async function Tt(r,i,t){try{let f=new URL(r.url),e=parseInt(f.searchParams.get("limit")||"100",10),o=Number.isNaN(e)?100:Math.min(e,100),n=`
      SELECT
        h.tmdb_id,
        h.best_platform,
        h.total_score,
        h.rank_score,
        h.platform_weight,
        h.engagement_score,
        h.admin_boost,
        h.calc_date,
        COALESCE(ab.is_pinned, 0) AS is_pinned,
        w.title_ko,
        w.title_en,
        w.poster_path,
        w.hero_backdrop_path,
        w.hero_custom_image_url,
        w.hero_title_baked_in,
        w.media_type,
        ROUND(w.tmdb_rating, 1) AS tmdb_rating,
        w.release_year
      FROM hot100_scores h
      LEFT JOIN works w ON w.tmdb_id = h.tmdb_id
      LEFT JOIN admin_boosts ab ON ab.tmdb_id = h.tmdb_id
      ORDER BY h.total_score DESC, w.tmdb_rating DESC
      LIMIT ?
    `,{results:_}=await i.DB.prepare(n).bind(o).all();return!_||_.length===0?new Response(JSON.stringify({ok:!0,data:[]}),{status:200,headers:t}):new Response(JSON.stringify({ok:!0,data:_.map((c,d)=>({hot_rank:d+1,...c}))}),{status:200,headers:t})}catch(f){return console.error("getHot100 \uC624\uB958:",f),new Response(JSON.stringify({ok:!1,error:"HOT100 \uC870\uD68C \uC911 \uC624\uB958\uAC00 \uBC1C\uC0DD\uD588\uC2B5\uB2C8\uB2E4.",detail:f.message}),{status:500,headers:t})}}async function Dt(r,i,t){if(!await N(r,i))return new Response(JSON.stringify({ok:!1,error:"\uAD00\uB9AC\uC790 \uC778\uC99D\uC774 \uD544\uC694\uD569\uB2C8\uB2E4."}),{status:401,headers:t});try{let{results:e}=await i.DB.prepare(`SELECT platform, category_slot, top_n, display_order, is_active
       FROM hot100_frontend_tabs
       ORDER BY display_order ASC`).all();return new Response(JSON.stringify({ok:!0,data:e||[]}),{status:200,headers:t})}catch(e){return new Response(JSON.stringify({ok:!1,error:e.message}),{status:500,headers:t})}}async function ht(r,i,t,f){if(!await N(i,t))return new Response(JSON.stringify({ok:!1,error:"\uAD00\uB9AC\uC790 \uC778\uC99D\uC774 \uD544\uC694\uD569\uB2C8\uB2E4."}),{status:401,headers:f});try{let o=await i.json(),{category_slot:n,top_n:_,display_order:c,is_active:d}=o;return await t.DB.prepare(`UPDATE hot100_frontend_tabs SET
         category_slot = COALESCE(?, category_slot),
         top_n         = COALESCE(?, top_n),
         display_order = COALESCE(?, display_order),
         is_active     = COALESCE(?, is_active)
       WHERE platform = ?`).bind(n??null,_??null,c??null,d??null,r).run(),new Response(JSON.stringify({ok:!0}),{status:200,headers:f})}catch(o){return new Response(JSON.stringify({ok:!1,error:o.message}),{status:500,headers:f})}}async function Lt(r,i,t){try{let e=new URL(r.url).searchParams.get("page");if(e){let a=await i.DB.prepare("SELECT is_active FROM hot100_page_display WHERE page = ?").bind(e).first();if(!a||!a.is_active)return new Response(JSON.stringify({ok:!0,active:!1,tabs:[]}),{status:200,headers:t})}let o={all:"\uC804\uCCB4 \uC21C\uC704",netflix:"\uB137\uD50C\uB9AD\uC2A4",tving:"\uD2F0\uBE59",disney:"\uB514\uC988\uB2C8+",coupang:"\uCFE0\uD321\uD50C\uB808\uC774",wavve:"\uC6E8\uC774\uBE0C",boxoffice:"\uBC15\uC2A4\uC624\uD53C\uC2A4"},{results:n}=await i.DB.prepare(`SELECT platform, category_slot, top_n, display_order
       FROM hot100_frontend_tabs
       WHERE is_active = 1
       ORDER BY display_order ASC`).all();if(!n||n.length===0)return new Response(JSON.stringify({ok:!0,active:!0,tabs:[]}),{status:200,headers:t});let _=[];for(let a of n){let l=a.top_n||10;if(a.platform==="all"){_.push(i.DB.prepare(`SELECT h.tmdb_id, h.best_platform, w.title_ko, w.title_en,
                    w.poster_path, w.hero_backdrop_path, w.hero_custom_image_url, w.hero_title_baked_in,
                    w.hero_logo_path, w.media_type, ROUND(w.tmdb_rating, 1) AS tmdb_rating
             FROM hot100_scores h
             LEFT JOIN works w ON w.tmdb_id = h.tmdb_id
             ORDER BY h.total_score DESC
             LIMIT ?`).bind(l));continue}a.category_slot&&(_.push(i.DB.prepare(`SELECT r.rank, r.tmdb_id, r.title_ko, r.title_en, r.poster_path,
                  w.hero_backdrop_path, w.hero_custom_image_url, w.hero_title_baked_in,
                  w.hero_logo_path, w.media_type, ROUND(w.tmdb_rating, 1) AS tmdb_rating
           FROM rankings r
           LEFT JOIN works w ON w.tmdb_id = r.tmdb_id
           WHERE r.platform = ? AND r.category_slot = ?
             AND r.date = (
               SELECT MAX(date) FROM rankings
               WHERE platform = ? AND category_slot = ? AND date < 'manual'
             )
           ORDER BY r.rank ASC`).bind(a.platform,a.category_slot,a.platform,a.category_slot)),_.push(i.DB.prepare(`SELECT r.rank, r.tmdb_id, r.title_ko, r.title_en, r.poster_path,
                  w.hero_backdrop_path, w.hero_custom_image_url, w.hero_title_baked_in,
                  w.hero_logo_path, w.media_type, ROUND(w.tmdb_rating, 1) AS tmdb_rating
           FROM rankings r
           LEFT JOIN works w ON w.tmdb_id = r.tmdb_id
           WHERE r.platform = ? AND r.category_slot = ? AND r.is_manual = 1 AND r.date = 'manual'
           ORDER BY r.rank ASC`).bind(a.platform,a.category_slot)))}let c=_.length?await i.DB.batch(_):[],d=0,s=[];for(let a of n){let l=a.top_n||10;if(a.platform==="all"){let m=c[d++]?.results||[];s.push({platform:"all",label:o.all,items:m.map((E,w)=>({rank:w+1,tmdb_id:E.tmdb_id,best_platform:E.best_platform,title_ko:E.title_ko,title_en:E.title_en,poster_path:E.poster_path,hero_backdrop_path:E.hero_backdrop_path,hero_custom_image_url:E.hero_custom_image_url,hero_title_baked_in:E.hero_title_baked_in,hero_logo_path:E.hero_logo_path,media_type:E.media_type,tmdb_rating:E.tmdb_rating}))});continue}if(!a.category_slot)continue;let p=c[d++]?.results||[],u=c[d++]?.results||[],g=j(p,u,l);s.push({platform:a.platform,label:o[a.platform]||a.platform,items:g.map(m=>({rank:m.rank,tmdb_id:m.tmdb_id,best_platform:a.platform,title_ko:m.title_ko,title_en:m.title_en,poster_path:m.poster_path,hero_backdrop_path:m.hero_backdrop_path,hero_custom_image_url:m.hero_custom_image_url,hero_title_baked_in:m.hero_title_baked_in,hero_logo_path:m.hero_logo_path,media_type:m.media_type,tmdb_rating:m.tmdb_rating}))})}return new Response(JSON.stringify({ok:!0,active:!0,tabs:s}),{status:200,headers:t})}catch(f){return new Response(JSON.stringify({ok:!1,error:"\uD788\uC5B4\uB85C \uD0ED \uC870\uD68C \uC911 \uC624\uB958\uAC00 \uBC1C\uC0DD\uD588\uC2B5\uB2C8\uB2E4.",detail:f.message}),{status:500,headers:t})}}async function At(r,i,t){if(!await N(r,i))return new Response(JSON.stringify({ok:!1,error:"\uAD00\uB9AC\uC790 \uC778\uC99D\uC774 \uD544\uC694\uD569\uB2C8\uB2E4."}),{status:401,headers:t});try{let e=30;try{let _=await r.json();_&&_.limit&&(e=Math.min(Math.max(parseInt(_.limit,10)||30,1),50))}catch{}let o=await yt(i,e),n=await i.DB.prepare(`SELECT COUNT(*) AS cnt
       FROM hot100_scores h
       JOIN works w ON w.tmdb_id = h.tmdb_id
       WHERE COALESCE(w.hero_title_baked_in, 0) = 0
         AND w.hero_logo_checked_at IS NULL`).first();return new Response(JSON.stringify({ok:!0,...o,remaining:n?.cnt??0}),{status:200,headers:t})}catch(e){return new Response(JSON.stringify({ok:!1,error:"\uB85C\uACE0 \uBC31\uD544 \uC911 \uC624\uB958\uAC00 \uBC1C\uC0DD\uD588\uC2B5\uB2C8\uB2E4.",detail:e.message}),{status:500,headers:t})}}async function It(r,i,t){if(!await N(r,i))return new Response(JSON.stringify({ok:!1,error:"\uAD00\uB9AC\uC790 \uC778\uC99D\uC774 \uD544\uC694\uD569\uB2C8\uB2E4."}),{status:401,headers:t});try{let e=await i.DB.prepare(`SELECT COUNT(*) AS cnt
       FROM hot100_scores h
       JOIN works w ON w.tmdb_id = h.tmdb_id
       WHERE COALESCE(w.hero_title_baked_in, 0) = 0
         AND w.hero_logo_checked_at IS NULL`).first();return new Response(JSON.stringify({ok:!0,remaining:e?.cnt??0}),{status:200,headers:t})}catch(e){return new Response(JSON.stringify({ok:!1,error:e.message}),{status:500,headers:t})}}async function Ct(r,i,t){if(!await N(r,i))return new Response(JSON.stringify({ok:!1,error:"\uAD00\uB9AC\uC790 \uC778\uC99D\uC774 \uD544\uC694\uD569\uB2C8\uB2E4."}),{status:401,headers:t});try{let{results:e}=await i.DB.prepare("SELECT page, is_active FROM hot100_page_display ORDER BY page ASC").all();return new Response(JSON.stringify({ok:!0,data:e||[]}),{status:200,headers:t})}catch(e){return new Response(JSON.stringify({ok:!1,error:e.message}),{status:500,headers:t})}}async function Bt(r,i,t,f){if(!await N(i,t))return new Response(JSON.stringify({ok:!1,error:"\uAD00\uB9AC\uC790 \uC778\uC99D\uC774 \uD544\uC694\uD569\uB2C8\uB2E4."}),{status:401,headers:f});try{let o=await i.json(),{is_active:n}=o;return await t.DB.prepare("UPDATE hot100_page_display SET is_active = ? WHERE page = ?").bind(n?1:0,r).run(),new Response(JSON.stringify({ok:!0}),{status:200,headers:f})}catch(o){return new Response(JSON.stringify({ok:!1,error:o.message}),{status:500,headers:f})}}async function Jt(r,i,t){try{let e=new URL(r.url).searchParams.get("page");if(!e)return new Response(JSON.stringify({ok:!1,error:"page \uD30C\uB77C\uBBF8\uD130\uAC00 \uD544\uC694\uD569\uB2C8\uB2E4."}),{status:400,headers:t});let o=await i.DB.prepare("SELECT is_active FROM hot100_page_display WHERE page = ?").bind(e).first();return new Response(JSON.stringify({ok:!0,is_active:!!(o&&o.is_active)}),{status:200,headers:t})}catch(f){return new Response(JSON.stringify({ok:!1,error:f.message}),{status:500,headers:t})}}var Ye={async fetch(r,i,t){let f=new URL(r.url),e=f.pathname,o=r.headers.get("Origin")||"https://ottrank.kr",_=["https://ottrank.kr","http://localhost:8788","http://localhost:3000"].includes(o)?o:"https://ottrank.kr",c={"Content-Type":"application/json","Access-Control-Allow-Origin":_,"Access-Control-Allow-Credentials":"true"};if(r.method==="OPTIONS")return new Response(null,{headers:{"Access-Control-Allow-Origin":_,"Access-Control-Allow-Credentials":"true","Access-Control-Allow-Methods":"GET, POST, PUT, PATCH, DELETE, OPTIONS","Access-Control-Allow-Headers":"Content-Type, Authorization"}});let d=null;(e.startsWith("/contents")||e.startsWith("/admin/contents"))&&(d=await dt(e,r,i,f,c)),!d&&e.startsWith("/auth/")&&(d=await nt(e,r,i,c)),!d&&(e.startsWith("/rankings")||e==="/latest-date"||e==="/platforms"||e==="/sitemap.xml")&&(d=await Q(e,r,i,f,c)),!d&&(e==="/works/search"||e==="/works/exists")&&(d=await at(e,r,i,f,c)),!d&&(e.startsWith("/videos/")||e.startsWith("/admin/videos")||e.startsWith("/imdb/")||e.startsWith("/youtube/")||e.startsWith("/works/")||e.startsWith("/kmrb/")||e.startsWith("/search/"))&&(d=await et(e,r,i,t,f,c)),!d&&(e.startsWith("/reactions")||e.startsWith("/admin/reactions"))&&(d=await rt(e,r,i,t,c)),!d&&(e.startsWith("/wishlist")||e.startsWith("/reviews")||e.startsWith("/mypage")||e.startsWith("/user/")||e==="/grade-settings"||e.startsWith("/life-works")||e.startsWith("/pick-lists")||e.startsWith("/admin/reviews"))&&(d=await ot(e,r,i,t,c)),!d&&e.startsWith("/posts")&&(d=await lt(e,r,i,t,f,c)),!d&&e.startsWith("/blog-gen")&&(d=await Et(e,r,i,f,c)),!d&&e.startsWith("/work-ott")&&(d=await G(e,r,i,f,c)),!d&&(e==="/inquiry"||e.startsWith("/admin/inquiry"))&&(d=await kt(e,r,i,t,f,c)),!d&&e==="/admin/calc-hot100"&&(d=await Rt(r,i,c)),!d&&e==="/hot100"&&(d=await Tt(r,i,c)),!d&&e==="/hot100/hero-tabs"&&(d=await Lt(r,i,c)),!d&&e==="/admin/hot100/boosts/search"&&r.method==="GET"&&(d=await Ot(r,i,c)),!d&&e==="/admin/hot100/boosts"&&r.method==="GET"&&(d=await St(r,i,c)),!d&&e==="/admin/hot100/boosts"&&r.method==="POST"&&(d=await bt(r,i,c));let s=e.match(/^\/admin\/hot100\/boosts\/(\d+)$/);!d&&s&&r.method==="DELETE"&&(d=await Nt(parseInt(s[1],10),r,i,c)),!d&&e==="/admin/hot100/frontend-tabs"&&r.method==="GET"&&(d=await Dt(r,i,c));let a=e.match(/^\/admin\/hot100\/frontend-tabs\/([a-z]+)$/);!d&&a&&r.method==="PATCH"&&(d=await ht(a[1],r,i,c)),!d&&e==="/admin/hot100/backfill-logos"&&r.method==="POST"&&(d=await At(r,i,c)),!d&&e==="/admin/hot100/backfill-logos/status"&&r.method==="GET"&&(d=await It(r,i,c)),!d&&e==="/admin/hot100/page-display"&&r.method==="GET"&&(d=await Ct(r,i,c));let l=e.match(/^\/admin\/hot100\/page-display\/([a-z]+)$/);return!d&&l&&r.method==="PATCH"&&(d=await Bt(l[1],r,i,c)),!d&&e==="/hot100/page-display"&&r.method==="GET"&&(d=await Jt(r,i,c)),!d&&e.startsWith("/admin/")&&(d=await G(e,r,i,f,c)),d||(d=new Response(JSON.stringify({ok:!1,message:"Not found"}),{status:404,headers:c})),d}};export{Ye as default};
