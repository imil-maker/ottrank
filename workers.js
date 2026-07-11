function x(d,i,t){if(!i.length)return d.slice(0,t).map((r,a)=>({...r,rank:a+1}));let f=new Set(i.map(r=>r.tmdb_id).filter(Boolean)),s=d.filter(r=>!f.has(r.tmdb_id)),o={};for(let r of i){let a=Math.max(1,parseInt(r.rank)||1);o[a]||(o[a]=[]),o[a].push(r)}let n=[],l=0,e=1;for(;n.length<t;){if(o[e]&&o[e].length){let r=o[e].shift();n.push({...r,rank:n.length+1})}else if(l<s.length)n.push({...s[l],rank:n.length+1}),l++;else{let r=Object.values(o).flat();for(let a of r){if(n.length>=t)break;n.push({...a,rank:n.length+1})}break}e++}return n}async function G(d,i,t,f,s){if(d==="/rankings"&&i.method==="GET"){let o=f.searchParams.get("platform"),n=f.searchParams.get("category"),l=f.searchParams.get("date"),e="SELECT * FROM rankings WHERE 1=1",r=[];o&&(e+=" AND platform = ?",r.push(o)),n&&(e+=" AND category = ?",r.push(n)),l?(e+=" AND date = ?",r.push(l)):e+=" AND date = (SELECT MAX(date) FROM rankings)",e+=" ORDER BY platform, category, rank";let{results:a}=await t.DB.prepare(e).bind(...r).all();return new Response(JSON.stringify({ok:!0,data:a}),{headers:s})}if(d==="/rankings/main"&&i.method==="GET")try{let o=f.searchParams.get("date")||null,{results:n}=await t.DB.prepare(`
        SELECT
          r.platform, r.category_slot, r.rank, r.title_ko, r.title_en,
          r.tmdb_id, r.poster_path, r.genre, r.tmdb_rating, r.release_year, r.memo,
          oc.display_name, oc.main_section, oc.main_order, oc.main_limit, oc.memo_label
        FROM rankings r
        JOIN ott_categories oc
          ON r.platform = oc.platform AND r.category_slot = oc.category_slot
        WHERE oc.main_section IS NOT NULL
          AND oc.is_active = 1
          AND r.date = COALESCE(?, (SELECT MAX(date) FROM rankings WHERE date != 'manual'))
          AND r.rank <= oc.main_limit + 20
        ORDER BY oc.main_section, oc.main_order, r.rank
      `).bind(o).all(),{results:l}=await t.DB.prepare(`
        SELECT
          r.platform, r.category_slot, r.rank, r.title_ko, r.title_en,
          r.tmdb_id, r.poster_path, r.genre, r.tmdb_rating, r.release_year, r.memo,
          oc.display_name, oc.main_section, oc.main_order, oc.main_limit, oc.memo_label
        FROM rankings r
        JOIN ott_categories oc
          ON r.platform = oc.platform AND r.category_slot = oc.category_slot
        WHERE oc.main_section IS NOT NULL
          AND oc.is_active = 1
          AND r.is_manual = 1
          AND r.date = 'manual'
        ORDER BY oc.main_section, oc.main_order, r.rank
      `).all(),e={},r={},a={};for(let E of n){let w=`${E.platform}__${E.category_slot}`;e[w]||(e[w]=[]),a[w]||(a[w]=E),e[w].push(E)}for(let E of l){let w=`${E.platform}__${E.category_slot}`;r[w]||(r[w]=[]),a[w]||(a[w]=E),r[w].push(E)}let c={},p={},m={},_=new Set([...Object.keys(e),...Object.keys(r)]);for(let E of _){let w=a[E];if(!w)continue;let y=w.main_limit||10,b=x((e[E]||[]).sort((N,R)=>N.rank-R.rank),(r[E]||[]).sort((N,R)=>N.rank-R.rank),y);for(let N of b){let R={rank:N.rank,title_ko:N.title_ko,title_en:N.title_en,tmdb_id:N.tmdb_id,poster_path:N.poster_path,genre:N.genre,tmdb_rating:N.tmdb_rating,release_year:N.release_year,memo:N.memo||null,display_name:w.display_name,platform:w.platform,category_slot:w.category_slot,main_order:w.main_order};w.main_section==="tv"?(c[E]||(c[E]={platform:w.platform,category_slot:w.category_slot,display_name:w.display_name,main_order:w.main_order,memo_label:w.memo_label||null,items:[]}),c[E].items.push(R)):w.main_section==="movie"?(p[E]||(p[E]={platform:w.platform,category_slot:w.category_slot,display_name:w.display_name,main_order:w.main_order,memo_label:w.memo_label||null,items:[]}),p[E].items.push(R)):w.main_section==="featured"&&w.platform==="netflix"&&(m[E]||(m[E]={platform:w.platform,category_slot:w.category_slot,display_name:w.display_name,main_order:w.main_order,memo_label:w.memo_label||null,items:[]}),m[E].items.push(R))}}let u=Object.values(c).sort((E,w)=>E.main_order-w.main_order),g=Object.values(p).sort((E,w)=>E.main_order-w.main_order),k=Object.values(m).sort((E,w)=>E.main_order-w.main_order).slice(0,2);return new Response(JSON.stringify({ok:!0,tv:u,movie:g,featured:k}),{headers:s})}catch(o){return new Response(JSON.stringify({ok:!1,message:o.message}),{status:500,headers:s})}if(d==="/rankings/platform"&&i.method==="GET")try{let o=f.searchParams.get("platform"),n=f.searchParams.get("date")||null;if(!o)return new Response(JSON.stringify({ok:!1,message:"platform required"}),{status:400,headers:s});let{results:l}=await t.DB.prepare(`
        SELECT
          r.platform, r.category_slot, r.rank, r.title_ko, r.title_en,
          r.tmdb_id, r.poster_path, r.genre, r.tmdb_rating, r.release_year, r.memo,
          oc.display_name, oc.platform_section, oc.platform_order, oc.platform_limit, oc.memo_label
        FROM rankings r
        JOIN ott_categories oc
          ON r.platform = oc.platform AND r.category_slot = oc.category_slot
        WHERE r.platform = ?
          AND oc.platform_section IS NOT NULL
          AND oc.is_active = 1
          AND r.date = COALESCE(?, (SELECT MAX(date) FROM rankings WHERE date != 'manual'))
          AND r.rank <= oc.platform_limit + 20
        ORDER BY oc.platform_order, r.rank
      `).bind(o,n).all(),{results:e}=await t.DB.prepare(`
        SELECT
          r.platform, r.category_slot, r.rank, r.title_ko, r.title_en,
          r.tmdb_id, r.poster_path, r.genre, r.tmdb_rating, r.release_year, r.memo,
          oc.display_name, oc.platform_section, oc.platform_order, oc.platform_limit, oc.memo_label
        FROM rankings r
        JOIN ott_categories oc
          ON r.platform = oc.platform AND r.category_slot = oc.category_slot
        WHERE r.platform = ?
          AND oc.platform_section IS NOT NULL
          AND oc.is_active = 1
          AND r.is_manual = 1
          AND r.date = 'manual'
        ORDER BY oc.platform_order, r.rank
      `).bind(o).all(),r={},a={},c={};for(let u of l){let g=u.category_slot;r[g]||(r[g]=[]),c[g]||(c[g]=u),r[g].push(u)}for(let u of e){let g=u.category_slot;a[g]||(a[g]=[]),c[g]||(c[g]=u),a[g].push(u)}let p={},m=new Set([...Object.keys(r),...Object.keys(a)]);for(let u of m){let g=c[u];if(!g)continue;let k=g.platform_limit||20,E=x((r[u]||[]).sort((w,y)=>w.rank-y.rank),(a[u]||[]).sort((w,y)=>w.rank-y.rank),k);p[u]={platform:g.platform,category_slot:g.category_slot,display_name:g.display_name,platform_order:g.platform_order,memo_label:g.memo_label||null,items:E.map(w=>({rank:w.rank,title_ko:w.title_ko,title_en:w.title_en,tmdb_id:w.tmdb_id,poster_path:w.poster_path,genre:w.genre,tmdb_rating:w.tmdb_rating,release_year:w.release_year,memo:w.memo||null}))}}let _=Object.values(p).sort((u,g)=>u.platform_order-g.platform_order);return new Response(JSON.stringify({ok:!0,data:_}),{headers:s})}catch(o){return new Response(JSON.stringify({ok:!1,message:o.message}),{status:500,headers:s})}if(d==="/rankings/weekly"&&i.method==="GET")try{let{results:o}=await t.DB.prepare(`
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
          AND r.date >= date((SELECT MAX(date) FROM rankings WHERE date != 'manual'), '-6 days')
          AND r.date != 'manual'
          AND r.rank <= 10
        GROUP BY r.platform, r.category_slot, r.title_ko
        ORDER BY oc.main_section, oc.main_order, rank
      `).all(),n={},l={};for(let a of o){if(a.rank>(a.main_limit||10))continue;let c=`${a.platform}__${a.category_slot}`,p={rank:a.rank,title_ko:a.title_ko,title_en:a.title_en,tmdb_id:a.tmdb_id,poster_path:a.poster_path,genre:a.genre,tmdb_rating:a.tmdb_rating,release_year:a.release_year,platform:a.platform,category_slot:a.category_slot,display_name:a.display_name,main_order:a.main_order};a.main_section==="tv"?(n[c]||(n[c]={platform:a.platform,category_slot:a.category_slot,display_name:a.display_name,main_order:a.main_order,items:[]}),n[c].items.push(p)):a.main_section==="movie"&&(l[c]||(l[c]={platform:a.platform,category_slot:a.category_slot,display_name:a.display_name,main_order:a.main_order,items:[]}),l[c].items.push(p))}let e=Object.values(n).sort((a,c)=>a.main_order-c.main_order),r=Object.values(l).sort((a,c)=>a.main_order-c.main_order);return new Response(JSON.stringify({ok:!0,tv:e,movie:r}),{headers:s})}catch(o){return new Response(JSON.stringify({ok:!1,message:o.message}),{status:500,headers:s})}if(d==="/rankings/monthly"&&i.method==="GET")try{let{results:o}=await t.DB.prepare(`
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
          AND r.date >= date((SELECT MAX(date) FROM rankings WHERE date != 'manual'), '-29 days')
          AND r.date != 'manual'
          AND r.rank <= 10
        GROUP BY r.platform, r.category_slot, r.title_ko
        ORDER BY oc.main_section, oc.main_order, rank
      `).all(),n={},l={};for(let a of o){if(a.rank>(a.main_limit||10))continue;let c=`${a.platform}__${a.category_slot}`,p={rank:a.rank,title_ko:a.title_ko,title_en:a.title_en,tmdb_id:a.tmdb_id,poster_path:a.poster_path,genre:a.genre,tmdb_rating:a.tmdb_rating,release_year:a.release_year,platform:a.platform,category_slot:a.category_slot,display_name:a.display_name,main_order:a.main_order};a.main_section==="tv"?(n[c]||(n[c]={platform:a.platform,category_slot:a.category_slot,display_name:a.display_name,main_order:a.main_order,items:[]}),n[c].items.push(p)):a.main_section==="movie"&&(l[c]||(l[c]={platform:a.platform,category_slot:a.category_slot,display_name:a.display_name,main_order:a.main_order,items:[]}),l[c].items.push(p))}let e=Object.values(n).sort((a,c)=>a.main_order-c.main_order),r=Object.values(l).sort((a,c)=>a.main_order-c.main_order);return new Response(JSON.stringify({ok:!0,tv:e,movie:r}),{headers:s})}catch(o){return new Response(JSON.stringify({ok:!1,message:o.message}),{status:500,headers:s})}if(d==="/rankings/history"&&i.method==="GET"){let o=parseInt(f.searchParams.get("tmdb_id"));if(!o)return new Response(JSON.stringify({ok:!1,message:"tmdb_id required"}),{status:400,headers:s});let{results:n}=await t.DB.prepare(`
      SELECT date, platform, category_slot, rank
      FROM rankings
      WHERE tmdb_id = ?
        AND date != 'manual'
        AND date >= date((SELECT MAX(date) FROM rankings WHERE date != 'manual'), '-29 days')
      ORDER BY date ASC, platform ASC
    `).bind(o).all();return new Response(JSON.stringify({ok:!0,data:n}),{headers:s})}if(d.startsWith("/rankings/platforms/")&&i.method==="GET"){let o=parseInt(d.split("/rankings/platforms/")[1]);if(!o)return new Response(JSON.stringify({ok:!1,message:"tmdb_id required"}),{status:400,headers:s});try{let{results:n}=await t.DB.prepare(`
        SELECT DISTINCT platform, MIN(rank) as rank
        FROM rankings
        WHERE tmdb_id = ?
          AND date = (SELECT MAX(date) FROM rankings WHERE date != 'manual')
        GROUP BY platform
        ORDER BY rank ASC
      `).bind(o).all();return new Response(JSON.stringify({ok:!0,data:n}),{headers:s})}catch(n){return new Response(JSON.stringify({ok:!1,message:n.message}),{status:500,headers:s})}}if(d==="/rankings/platforms-batch"&&i.method==="GET"){let o=(f.searchParams.get("tmdb_ids")||"").trim();if(!o)return new Response(JSON.stringify({ok:!1,message:"tmdb_ids required"}),{status:400,headers:s});let n=[...new Set(o.split(",").map(l=>parseInt(l.trim())).filter(l=>Number.isInteger(l)&&l>0))].slice(0,50);if(!n.length)return new Response(JSON.stringify({ok:!1,message:"\uC720\uD6A8\uD55C tmdb_ids\uAC00 \uC5C6\uC2B5\uB2C8\uB2E4"}),{status:400,headers:s});try{let l=n.map(()=>"?").join(","),{results:e}=await t.DB.prepare(`
        SELECT tmdb_id, platform, MIN(rank) as rank
        FROM rankings
        WHERE tmdb_id IN (${l})
          AND date = (SELECT MAX(date) FROM rankings WHERE date != 'manual')
        GROUP BY tmdb_id, platform
        ORDER BY tmdb_id, rank ASC
      `).bind(...n).all(),r={};for(let a of e)r[a.tmdb_id]||(r[a.tmdb_id]=[]),r[a.tmdb_id].push({platform:a.platform,rank:a.rank});return new Response(JSON.stringify({ok:!0,data:r}),{headers:s})}catch(l){return new Response(JSON.stringify({ok:!1,message:l.message}),{status:500,headers:s})}}if(d==="/rankings/person-widget"&&i.method==="GET")try{let o=await t.DB.prepare(`
        SELECT platform, category_slot, display_name, person_limit
        FROM ott_categories
        WHERE person_section = 'person'
          AND is_active = 1
        ORDER BY person_order ASC
        LIMIT 1
      `).first();if(!o)return new Response(JSON.stringify({ok:!0,data:null}),{headers:s});let n=o.person_limit||10,{results:l}=await t.DB.prepare(`
        SELECT r.rank, r.title_ko, r.title_en, r.tmdb_id, r.poster_path, r.genre,
               r.tmdb_rating, r.release_year, w.media_type
        FROM rankings r
        LEFT JOIN works w ON r.tmdb_id = w.tmdb_id
        WHERE r.platform = ? AND r.category_slot = ?
          AND r.date = (SELECT MAX(date) FROM rankings WHERE date != 'manual')
        ORDER BY r.rank ASC
      `).bind(o.platform,o.category_slot).all(),{results:e}=await t.DB.prepare(`
        SELECT r.rank, r.title_ko, r.title_en, r.tmdb_id, r.poster_path, r.genre,
               r.tmdb_rating, r.release_year, w.media_type
        FROM rankings r
        LEFT JOIN works w ON r.tmdb_id = w.tmdb_id
        WHERE r.platform = ? AND r.category_slot = ?
          AND r.is_manual = 1 AND r.date = 'manual'
        ORDER BY r.rank ASC
      `).bind(o.platform,o.category_slot).all(),r=x(l,e,n);return new Response(JSON.stringify({ok:!0,data:{platform:o.platform,category_slot:o.category_slot,display_name:o.display_name,items:r.map(a=>({rank:a.rank,title_ko:a.title_ko,title_en:a.title_en,tmdb_id:a.tmdb_id,poster_path:a.poster_path,genre:a.genre,tmdb_rating:a.tmdb_rating,release_year:a.release_year,media_type:a.media_type||null}))}}),{headers:s})}catch(o){return new Response(JSON.stringify({ok:!1,message:o.message}),{status:500,headers:s})}if(d.startsWith("/rankings/manual/")&&i.method==="GET"){let o=parseInt(d.split("/rankings/manual/")[1]);if(!o)return new Response(JSON.stringify({ok:!1,message:"tmdb_id required"}),{status:400,headers:s});try{let{results:n}=await t.DB.prepare(`
        SELECT
          r.rank, r.memo, r.platform, r.category_slot,
          oc.display_name, oc.memo_label
        FROM rankings r
        LEFT JOIN ott_categories oc
          ON r.platform = oc.platform AND r.category_slot = oc.category_slot
        WHERE r.tmdb_id = ? AND r.date = 'manual'
        ORDER BY r.rank ASC
      `).bind(o).all();return new Response(JSON.stringify({ok:!0,data:n}),{headers:s})}catch(n){return new Response(JSON.stringify({ok:!1,message:n.message}),{status:500,headers:s})}}if(d==="/latest-date"){let{results:o}=await t.DB.prepare("SELECT MAX(date) as date FROM rankings WHERE date != 'manual'").all();return new Response(JSON.stringify({ok:!0,data:o[0]}),{headers:s})}if(d==="/platforms"){let{results:o}=await t.DB.prepare("SELECT DISTINCT platform FROM rankings ORDER BY platform").all();return new Response(JSON.stringify({ok:!0,data:o}),{headers:s})}if(d==="/sitemap.xml")try{let o="https://ottrank.kr",n=new Date().getFullYear(),l=[{path:"/",changefreq:"daily",priority:"1.0"},{path:"/netflix",changefreq:"daily",priority:"0.9"},{path:"/tving",changefreq:"daily",priority:"0.9"},{path:"/disneyplus",changefreq:"daily",priority:"0.9"},{path:"/wavve",changefreq:"daily",priority:"0.9"},{path:"/coupangplay",changefreq:"daily",priority:"0.9"},{path:"/boxoffice",changefreq:"daily",priority:"0.9"},{path:"/community",changefreq:"daily",priority:"0.8"},{path:"/review",changefreq:"daily",priority:"0.8"},{path:"/reactions",changefreq:"daily",priority:"0.8"},{path:"/contents",changefreq:"daily",priority:"0.8"},{path:"/mypage",changefreq:"weekly",priority:"0.6"},{path:"/my_review",changefreq:"weekly",priority:"0.6"},{path:"/ott_intro.html",changefreq:"monthly",priority:"0.6"},{path:"/privacy",changefreq:"monthly",priority:"0.4"},{path:"/terms",changefreq:"monthly",priority:"0.4"}],{results:e}=await t.DB.prepare("SELECT tmdb_id FROM works WHERE tmdb_id IS NOT NULL ORDER BY tmdb_id").all(),{results:r}=await t.DB.prepare("SELECT tmdb_id FROM persons WHERE tmdb_id IS NOT NULL ORDER BY tmdb_id").all(),a=[];for(let p of l)a.push(`  <url>
    <loc>${o}${p.path}</loc>
    <changefreq>${p.changefreq}</changefreq>
    <priority>${p.priority}</priority>
  </url>`);for(let p of e){let m=`${o}/title/1-${n}${p.tmdb_id}`;a.push(`  <url>
    <loc>${m}</loc>
    <changefreq>weekly</changefreq>
    <priority>0.7</priority>
  </url>`)}for(let p of r){let m=`${o}/person/${p.tmdb_id}`;a.push(`  <url>
    <loc>${m}</loc>
    <changefreq>monthly</changefreq>
    <priority>0.5</priority>
  </url>`)}let c=`<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
`+a.join(`
`)+`
</urlset>`;return new Response(c,{headers:{...s,"Content-Type":"application/xml; charset=utf-8"}})}catch(o){return new Response(JSON.stringify({ok:!1,message:o.message}),{status:500,headers:s})}return null}function O(d,i){return(d.headers.get("Authorization")||"").replace("Bearer ","")===i.ADMIN_SECRET}function h(d){let t=(d.headers.get("Cookie")||"").match(/session=([^;]+)/);return t?t[1]:null}async function H(d,i,t,f){try{return await f.DB.prepare("INSERT INTO user_point_logs (user_id, points, reason) VALUES (?, ?, ?)").bind(d,i,t).run(),await f.DB.prepare("UPDATE users SET ott_points = MAX(0, COALESCE(ott_points, 0) + ?) WHERE id = ?").bind(i,d).run(),await F(d,f),!0}catch(s){return console.error("[_addOttPoints] \uC624\uB958:",s.message),!1}}async function F(d,i){try{let t=await i.DB.prepare("SELECT grade, ott_points FROM users WHERE id = ?").bind(d).first();if(!t||(await i.DB.prepare("SELECT is_special FROM grade_settings WHERE grade_key = ?").bind(t.grade||"rookie").first())?.is_special)return;let{results:s}=await i.DB.prepare(`SELECT grade_key FROM grade_settings
       WHERE is_special = 0 AND min_ott_points <= ?
       ORDER BY min_ott_points DESC LIMIT 1`).bind(t.ott_points||0).all(),o=s[0]?.grade_key||null;o&&o!==t.grade&&await i.DB.prepare("UPDATE users SET grade = ? WHERE id = ?").bind(o,d).run()}catch(t){console.error("[GRADE]",t.message)}}async function V(d,i){try{let b=function(D){if(!D||!y.length)return!0;let S=D.toLowerCase(),T=y.filter(C=>S.includes(C.toLowerCase())).length,L=y.length<=2?1:y.length===3?2:3;return T>=L},t=await i.DB.prepare("SELECT title_ko, title_en FROM works WHERE tmdb_id = ?").bind(d).first();if(!t?.title_ko)return console.log(`[YT_CRAWL] tmdb_id=${d} works \uC5C6\uC74C \u2014 \uC2A4\uD0B5`),0;let f=t.title_ko,s=t.title_en||"",o=await i.DB.prepare("SELECT platform, category_slot FROM rankings WHERE tmdb_id = ? ORDER BY date DESC LIMIT 1").bind(d).first(),n=new Set(["category07","category08"]),e=o?.platform==="netflix"&&n.has(o?.category_slot),r=e?"en":"ko",a=e&&s||f;console.log(`[YT_CRAWL] tmdb_id=${d} "${f}" \u2192 ${e?"\uC601\uC5B4":"\uD55C\uAD6D\uC5B4"} \uAC80\uC0C9 \uBAA8\uB4DC (slot=${o?.category_slot||"none"})`);let m=e?{netflix:"Netflix",tving:"Tving",disney:"Disney+",wavve:"Wavve",coupang:"Coupang Play",boxoffice:"Movie"}:{netflix:"\uB137\uD50C\uB9AD\uC2A4",tving:"\uD2F0\uBE59",disney:"\uB514\uC988\uB2C8\uD50C\uB7EC\uC2A4",wavve:"\uC6E8\uC774\uBE0C",coupang:"\uCFE0\uD321\uD50C\uB808\uC774",boxoffice:"\uC601\uD654"},_=o?.platform&&m[o.platform]||"",u=_?`${_} ${a}`:a,{results:g}=await i.DB.prepare("SELECT youtube_id, is_main FROM title_videos WHERE tmdb_id = ?").bind(d).all(),k=new Set(g.map(D=>D.youtube_id)),E=new Set(g.filter(D=>D.is_main===1).map(D=>D.youtube_id));E.size>0&&console.log(`[YT_CRAWL] tmdb_id=${d} \uBA54\uC778 \uC601\uC0C1 ${E.size}\uAC1C \uBCF4\uD638 \uC911`);let w=e?[`${u} official trailer`,`${u} trailer`]:[`${u} \uACF5\uC2DD \uC608\uACE0\uD3B8`,`${u} \uC608\uACE0\uD3B8`],y=a.replace(/[:\-·|]/g," ").replace(/[^\uAC00-\uD7A3a-zA-Z0-9\s]/g,"").split(/\s+/).filter(D=>D.length>=2),N=2,R=[];for(let D of w){if(R.length>=N)break;let S=`https://www.googleapis.com/youtube/v3/search?part=snippet&type=video&order=relevance&maxResults=8&relevanceLanguage=${r}&q=${encodeURIComponent(D)}&key=${i.YOUTUBE_API_KEY}`,T=await fetch(S),L=await T.json();if(!(!T.ok||!L.items?.length))for(let C of L.items){if(R.length>=N)break;let I=C.id?.videoId,B=C.snippet?.title||"";!I||k.has(I)||E.has(I)||b(B)&&(R.push({youtube_id:I,title:B||a,youtube_url:`https://www.youtube.com/watch?v=${I}`}),k.add(I))}}if(!R.length)return console.log(`[YT_CRAWL] tmdb_id=${d} "${u}" \uACB0\uACFC \uC5C6\uC74C (\uAD00\uB828\uC131 \uD544\uD130 \uD1B5\uACFC \uC601\uC0C1 \uC5C6\uC74C)`),0;for(let D of R)await i.DB.prepare(`
        INSERT OR IGNORE INTO title_videos (tmdb_id, youtube_url, youtube_id, title, is_main)
        VALUES (?, ?, ?, ?, 0)
      `).bind(d,D.youtube_url,D.youtube_id,D.title).run();return console.log(`[YT_CRAWL] \u2705 tmdb_id=${d} "${u}" ${R.length}\uAC1C \uC800\uC7A5`),R.length}catch(t){return console.error(`[YT_CRAWL] tmdb_id=${d} \uC624\uB958:`,t.message),0}}async function X(d,i){return V(d,i)}async function Q(d,i){let t=await V(d,i);try{await i.DB.prepare("UPDATE works SET yt_crawl_attempted_at = datetime('now') WHERE tmdb_id = ?").bind(d).run()}catch(f){console.error(`[YT_CRAWL_BATCH] tmdb_id=${d} \uC2DC\uB3C4 \uC2DC\uAC01 \uAE30\uB85D \uC2E4\uD328:`,f.message)}return t}async function Z(d,i){try{let f=(await i.DB.prepare("SELECT media_type FROM works WHERE tmdb_id = ?").bind(d).first())?.media_type||"tv",s=[];try{s=(await(await fetch(`https://api.themoviedb.org/3/${f}/${d}/videos?language=ko-KR&api_key=${i.TMDB_API_KEY}`)).json()).results||[]}catch{}if(!s.length)try{s=(await(await fetch(`https://api.themoviedb.org/3/${f}/${d}/videos?language=en-US&api_key=${i.TMDB_API_KEY}`)).json()).results||[]}catch{}let o=s.filter(l=>l.site==="YouTube"),n=[...o.filter(l=>l.type==="Trailer"||l.type==="Teaser"),...o.filter(l=>l.type!=="Trailer"&&l.type!=="Teaser")];if(!n.length)return console.log(`[TMDB_SAVE] tmdb_id=${d} TMDB \uC601\uC0C1 \uC5C6\uC74C`),0;for(let l=0;l<n.length;l++){let e=n[l],r=l===0?1:0;await i.DB.prepare(`
        INSERT OR IGNORE INTO title_videos (tmdb_id, youtube_url, youtube_id, title, is_main)
        VALUES (?, ?, ?, ?, ?)
      `).bind(d,`https://www.youtube.com/watch?v=${e.key}`,e.key,e.name||"",r).run()}return console.log(`[TMDB_SAVE] \u2705 tmdb_id=${d} ${n.length}\uAC1C \uC800\uC7A5`),n.length}catch(t){return console.error(`[TMDB_SAVE] tmdb_id=${d} \uC624\uB958:`,t.message),0}}async function j(d,i,t,f){try{console.log(`[REACTION] \uB313\uAE00 \uC218\uC9D1 \uC2DC\uC791: reaction=${d} video=${i}`);let s="https://www.googleapis.com/youtube/v3/commentThreads?part=snippet&videoId="+i+"&maxResults=100&order=relevance&key="+f.YOUTUBE_API_KEY,o=await fetch(s),n=await o.json();if(!o.ok||!n.items?.length){console.error("[REACTION] YouTube API \uC624\uB958:",JSON.stringify(n).slice(0,200));return}let e=n.items.map(u=>{let g=u.snippet.topLevelComment.snippet;return{author:(g.authorDisplayName||"\uC775\uBA85").replace(/^@/,""),text:(g.textDisplay||"").replace(/<[^>]*>/g,"").trim(),likes:g.likeCount||0,published:g.publishedAt||""}}).filter(u=>u.text.length>5).sort((u,g)=>g.likes-u.likes).slice(0,50);if(!e.length)return;let a=`\uC544\uB798\uB294 YouTube \uC601\uC0C1\uC758 \uD574\uC678 \uB313\uAE00 \uBAA9\uB85D\uC785\uB2C8\uB2E4.
\uAC01 \uB313\uAE00\uC744 \uC790\uC5F0\uC2A4\uB7EC\uC6B4 \uD55C\uAD6D\uC5B4\uB85C \uBC88\uC5ED\uD558\uC138\uC694.

\uBC18\uB4DC\uC2DC \uC544\uB798 JSON \uD615\uC2DD\uC73C\uB85C\uB9CC \uC751\uB2F5\uD558\uC138\uC694 (\uB2E4\uB978 \uD14D\uC2A4\uD2B8 \uC5C6\uC774):
[
  {"idx": 0, "translated": "\uBC88\uC5ED\uB41C \uB313\uAE00"},
  ...
]

\uB313\uAE00 \uBAA9\uB85D:
`+e.map((u,g)=>g+1+". "+u.text.slice(0,300)).join(`
`),m=(await(await fetch("https://api.anthropic.com/v1/messages",{method:"POST",headers:{"Content-Type":"application/json","x-api-key":f.ANTHROPIC_API_KEY,"anthropic-version":"2023-06-01"},body:JSON.stringify({model:"claude-haiku-4-5-20251001",max_tokens:4e3,messages:[{role:"user",content:a}]})})).json()).content?.[0]?.text||"[]",_=[];try{let u=m.split("```json").join("").split("```").join("").trim(),g=JSON.parse(u);_=Array.isArray(g)?g:[]}catch{console.error("[REACTION] Claude \uC751\uB2F5 \uD30C\uC2F1 \uC2E4\uD328:",m.slice(0,300)),_=[]}await f.DB.prepare("DELETE FROM reaction_comments WHERE reaction_id = ?").bind(d).run();for(let u=0;u<e.length;u++){let g=e[u],E=(_.find(w=>w.idx===u)||_.find(w=>w.idx===u+1)||_[u]||{}).translated||"";await f.DB.prepare(`
        INSERT INTO reaction_comments
          (reaction_id, tmdb_id, original_text, translated_text, author, like_count, sentiment)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).bind(d,t,g.text.slice(0,1e3),E.slice(0,1e3),g.author.slice(0,100),g.likes,"neutral").run()}console.log(`[REACTION] \u2705 \uC644\uB8CC: reaction=${d} \uB313\uAE00 ${e.length}\uAC1C \uC800\uC7A5`)}catch(s){console.error("[REACTION] \uC624\uB958:",s.message)}}async function v(d,i,t,f,s,o){if(d.startsWith("/videos/")&&!d.includes("/admin")&&i.method==="GET"){let n=parseInt(d.split("/videos/")[1]);if(!n)return new Response(JSON.stringify({ok:!1,message:"tmdb_id required"}),{status:400,headers:o});try{let{results:l}=await t.DB.prepare("SELECT * FROM title_videos WHERE tmdb_id = ? ORDER BY is_main DESC, created_at DESC").bind(n).all();return l.length===0&&f.waitUntil(Z(n,t)),new Response(JSON.stringify({ok:!0,data:l}),{headers:o})}catch(l){return new Response(JSON.stringify({ok:!1,message:l.message}),{status:500,headers:o})}}if(d==="/admin/videos/crawl"&&i.method==="POST"){if(i.headers.get("Authorization")!==`Bearer ${t.ADMIN_SECRET}`)return new Response(JSON.stringify({ok:!1,message:"Unauthorized"}),{status:401,headers:o});try{let n=await i.json(),{tmdb_id:l}=n;if(!l)return new Response(JSON.stringify({ok:!1,message:"tmdb_id required"}),{status:400,headers:o});let e=await X(parseInt(l),t);return new Response(JSON.stringify({ok:!0,saved:e}),{headers:o})}catch(n){return new Response(JSON.stringify({ok:!1,message:n.message}),{status:500,headers:o})}}if(d==="/admin/videos/batch-crawl"&&i.method==="POST"){if(i.headers.get("Authorization")!==`Bearer ${t.ADMIN_SECRET}`)return new Response(JSON.stringify({ok:!1,message:"Unauthorized"}),{status:401,headers:o});try{let n=20;try{let E=await i.json();E?.limit&&Number.isInteger(E.limit)&&E.limit>0&&(n=E.limit)}catch{}let l=30,r=(await t.DB.prepare("SELECT COUNT(*) AS cnt FROM works WHERE yt_crawl_attempted_at >= date('now')").first())?.cnt||0;if(r>=l){let E=await t.DB.prepare(`
          SELECT COUNT(*) AS cnt
          FROM works w
          WHERE (
            SELECT COUNT(*) FROM title_videos tv WHERE tv.tmdb_id = w.tmdb_id
          ) <= 1
          AND (
            w.yt_crawl_attempted_at IS NULL
            OR w.yt_crawl_attempted_at < datetime('now', '-3 days')
          )
        `).first();return new Response(JSON.stringify({ok:!0,attempted:0,filled:0,remaining:E?.cnt||0,message:`\uC624\uB298 \uC608\uC0B0(${l}\uAC1C) \uC18C\uC9C4 \u2014 \uB0B4\uC77C \uB2E4\uC2DC \uC2DC\uB3C4\uD574\uC8FC\uC138\uC694`}),{headers:o})}let a=Math.min(n,l-r),p=(await t.DB.prepare("SELECT MAX(date) AS latest_date FROM rankings WHERE date != 'manual'").first())?.latest_date||null,{results:m}=await t.DB.prepare(`
        SELECT w.tmdb_id
        FROM works w
        WHERE (
          SELECT COUNT(*) FROM title_videos tv WHERE tv.tmdb_id = w.tmdb_id
        ) <= 1
        AND (
          w.yt_crawl_attempted_at IS NULL
          OR w.yt_crawl_attempted_at < datetime('now', '-3 days')
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
      `).bind(p,a).all();if(!m.length)return new Response(JSON.stringify({ok:!0,attempted:0,filled:0,remaining:0,message:"\uB300\uC0C1 \uC791\uD488 \uC5C6\uC74C (\uBAA8\uB450 \uCFE8\uB2E4\uC6B4 \uC911\uC774\uAC70\uB098 \uC601\uC0C1\uC774 \uC774\uBBF8 \uCDA9\uBD84\uD568)"}),{headers:o});let _=[],u=0;for(let E of m)try{let w=await Q(E.tmdb_id,t);u+=w,_.push({tmdb_id:E.tmdb_id,saved:w,ok:!0})}catch(w){console.error(`[BATCH_CRAWL] tmdb_id=${E.tmdb_id} \uC624\uB958:`,w.message),_.push({tmdb_id:E.tmdb_id,saved:0,ok:!1,error:w.message})}let k=(await t.DB.prepare(`
        SELECT COUNT(*) AS cnt
        FROM works w
        WHERE (
          SELECT COUNT(*) FROM title_videos tv WHERE tv.tmdb_id = w.tmdb_id
        ) <= 1
        AND (
          w.yt_crawl_attempted_at IS NULL
          OR w.yt_crawl_attempted_at < datetime('now', '-3 days')
        )
      `).first())?.cnt||0;return console.log(`[BATCH_CRAWL] \u2705 \uC644\uB8CC: \uC2DC\uB3C4 ${m.length}\uAC74, \uC800\uC7A5 ${u}\uAC1C, \uB0A8\uC74C ${k}`),new Response(JSON.stringify({ok:!0,attempted:m.length,filled:u,remaining:k,results:_}),{headers:o})}catch(n){return new Response(JSON.stringify({ok:!1,message:n.message}),{status:500,headers:o})}}if(d==="/admin/videos"&&i.method==="POST"){if(i.headers.get("Authorization")!==`Bearer ${t.ADMIN_SECRET}`)return new Response(JSON.stringify({ok:!1,message:"Unauthorized"}),{status:401,headers:o});try{let n=await i.json(),{tmdb_id:l,youtube_url:e}=n,{title:r}=n;if(!l||!e)return new Response(JSON.stringify({ok:!1,message:"tmdb_id, youtube_url required"}),{status:400,headers:o});let a=e.match(/(?:v=|youtu\.be\/|embed\/)([a-zA-Z0-9_-]{11})/);if(!a)return new Response(JSON.stringify({ok:!1,message:"\uC720\uD6A8\uD558\uC9C0 \uC54A\uC740 \uC720\uD29C\uBE0C URL"}),{status:400,headers:o});let c=a[1],p=await t.DB.prepare("SELECT id, title FROM title_videos WHERE tmdb_id = ? AND youtube_id = ? LIMIT 1").bind(l,c).first();if(p)return new Response(JSON.stringify({ok:!1,message:`\uC774\uBBF8 \uB4F1\uB85D\uB41C \uC601\uC0C1\uC785\uB2C8\uB2E4. (\uC81C\uBAA9: "${p.title||c}")`}),{status:409,headers:o});if(!r)try{r=(await(await fetch(`https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${c}&format=json`)).json()).title||""}catch{r=""}return await t.DB.prepare("INSERT INTO title_videos (tmdb_id, youtube_url, youtube_id, title, is_main) VALUES (?, ?, ?, ?, 0)").bind(l,e,c,r).run(),new Response(JSON.stringify({ok:!0}),{headers:o})}catch(n){return new Response(JSON.stringify({ok:!1,message:n.message}),{status:500,headers:o})}}if(d.match(/\/admin\/videos\/(\d+)\/main/)&&i.method==="PATCH"){if(i.headers.get("Authorization")!==`Bearer ${t.ADMIN_SECRET}`)return new Response(JSON.stringify({ok:!1,message:"Unauthorized"}),{status:401,headers:o});let n=parseInt(d.match(/\/admin\/videos\/(\d+)\/main/)[1]);try{let{results:l}=await t.DB.prepare("SELECT tmdb_id FROM title_videos WHERE id = ?").bind(n).all();if(!l.length)return new Response(JSON.stringify({ok:!1,message:"\uC5C6\uC74C"}),{status:404,headers:o});let e=l[0].tmdb_id;return await t.DB.batch([t.DB.prepare("UPDATE title_videos SET is_main = 0 WHERE tmdb_id = ?").bind(e),t.DB.prepare("UPDATE title_videos SET is_main = 1 WHERE id = ?").bind(n)]),new Response(JSON.stringify({ok:!0}),{headers:o})}catch(l){return new Response(JSON.stringify({ok:!1,message:l.message}),{status:500,headers:o})}}if(d.match(/\/admin\/videos\/(\d+)$/)&&i.method==="DELETE"){if(i.headers.get("Authorization")!==`Bearer ${t.ADMIN_SECRET}`)return new Response(JSON.stringify({ok:!1,message:"Unauthorized"}),{status:401,headers:o});let n=parseInt(d.match(/\/admin\/videos\/(\d+)$/)[1]);try{return await t.DB.prepare("DELETE FROM title_videos WHERE id = ?").bind(n).run(),new Response(JSON.stringify({ok:!0}),{headers:o})}catch(l){return new Response(JSON.stringify({ok:!1,message:l.message}),{status:500,headers:o})}}if(d.startsWith("/imdb/")&&d!=="/imdb/save"&&i.method==="GET"){let n=d.split("/imdb/")[1];if(!n||!/^tt\d+$/.test(n))return new Response(JSON.stringify({ok:!1,message:"invalid imdb_id"}),{status:400,headers:o});try{let l=await t.DB.prepare("SELECT imdb_rating, imdb_votes, imdb_updated FROM works WHERE imdb_id = ? LIMIT 1").bind(n).first();if(l?.imdb_rating){let c=new Date(l.imdb_updated||0);if((Date.now()-c.getTime())/(1e3*60*60*24)<7)return new Response(JSON.stringify({ok:!0,source:"cache",rating:l.imdb_rating.toFixed(1),votes:l.imdb_votes||""}),{headers:o})}let e=t.OMDB_API_KEY;if(!e)return new Response(JSON.stringify({ok:!1,message:"OMDB key not configured"}),{status:500,headers:o});let a=await(await fetch(`https://www.omdbapi.com/?i=${n}&apikey=${e}`)).json();if(a.Response!=="False"){let c=parseFloat(a.imdbRating);if(!isNaN(c)){let p=a.imdbVotes||"",m=new Date().toISOString();return await t.DB.prepare("UPDATE works SET imdb_rating = ?, imdb_votes = ?, imdb_updated = ? WHERE imdb_id = ?").bind(c,p,m,n).run(),new Response(JSON.stringify({ok:!0,source:"omdb",rating:c.toFixed(1),votes:p}),{headers:o})}}return new Response(JSON.stringify({ok:!1,message:"rating not available"}),{status:404,headers:o})}catch(l){return console.error("[IMDB GET]",l),new Response(JSON.stringify({ok:!1,message:l.message}),{status:500,headers:o})}}if(d==="/imdb/save"&&i.method==="POST")try{let n=await i.json(),{tmdb_id:l,imdb_id:e}=n;return!l||!e?new Response(JSON.stringify({ok:!1,message:"tmdb_id and imdb_id required"}),{status:400,headers:o}):/^tt\d+$/.test(e)?(await t.DB.prepare("UPDATE works SET imdb_id = ? WHERE tmdb_id = ?").bind(e,parseInt(l)).run(),new Response(JSON.stringify({ok:!0}),{headers:o})):new Response(JSON.stringify({ok:!1,message:"invalid imdb_id format"}),{status:400,headers:o})}catch(n){return console.error("[IMDB SAVE]",n),new Response(JSON.stringify({ok:!1,message:n.message}),{status:500,headers:o})}if(d==="/youtube/trending"&&i.method==="GET")try{let{results:n}=await t.DB.prepare("SELECT * FROM youtube_trending ORDER BY rank ASC").all();if(n.length>0){let m=new Date(n[0].collected_at);if((Date.now()-m.getTime())/(1e3*60*60)<6)return new Response(JSON.stringify({ok:!0,data:n,cached:!0}),{headers:o})}let l=`https://www.googleapis.com/youtube/v3/videos?part=snippet,statistics&chart=mostPopular&regionCode=KR&maxResults=50&key=${t.YOUTUBE_API_KEY}`,e=await fetch(l),r=await e.json();if(!e.ok||!r.items?.length)return n.length>0?new Response(JSON.stringify({ok:!0,data:n,cached:!0}),{headers:o}):new Response(JSON.stringify({ok:!1,message:"YouTube API \uC624\uB958"}),{status:500,headers:o});let a=new Date().toISOString(),c=r.items.map((m,_)=>({rank:_+1,video_id:m.id,title:m.snippet?.title||"",channel:m.snippet?.channelTitle||"",thumbnail:m.snippet?.thumbnails?.medium?.url||m.snippet?.thumbnails?.default?.url||"",view_count:parseInt(m.statistics?.viewCount||0),collected_at:a}));await t.DB.prepare("DELETE FROM youtube_trending").run();let p=c.map(m=>t.DB.prepare(`
          INSERT INTO youtube_trending (rank, video_id, title, channel, thumbnail, view_count, collected_at)
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `).bind(m.rank,m.video_id,m.title,m.channel,m.thumbnail,m.view_count,m.collected_at));return await t.DB.batch(p),new Response(JSON.stringify({ok:!0,data:c,cached:!1}),{headers:o})}catch(n){return new Response(JSON.stringify({ok:!1,message:n.message}),{status:500,headers:o})}if(d==="/works/search"&&i.method==="GET"){let n=s.searchParams.get("q")||"",l=Math.min(parseInt(s.searchParams.get("limit")||"10"),20);if(!n.trim())return new Response(JSON.stringify({ok:!1,message:"q required"}),{status:400,headers:o});let e=n.replace(/\s+/g,"");try{let{results:r}=await t.DB.prepare(`
        SELECT tmdb_id, title_ko, title_en, poster_path, media_type
        FROM works
        WHERE REPLACE(title_ko, ' ', '') LIKE ? OR REPLACE(title_en, ' ', '') LIKE ?
        ORDER BY
          CASE WHEN REPLACE(title_ko, ' ', '') LIKE ? THEN 0 ELSE 1 END,
          title_ko ASC
        LIMIT ?
      `).bind(`%${e}%`,`%${e}%`,`${e}%`,l).all();return new Response(JSON.stringify({ok:!0,data:r}),{headers:o})}catch(r){return new Response(JSON.stringify({ok:!1,message:r.message}),{status:500,headers:o})}}if(d==="/works/register"&&i.method==="POST")try{let n=await i.json(),{tmdb_id:l,title_ko:e,title_en:r,poster_path:a,media_type:c,genre:p,original_language:m,tmdb_rating:_,release_date:u}=n;if(!l||!e)return new Response(JSON.stringify({ok:!1,message:"tmdb_id, title_ko required"}),{status:400,headers:o});let g=r&&/[\uAC00-\uD7A3]/.test(r),E=r&&/[a-zA-Z]/.test(r)&&!g?r:null,w=_??null,y=u||null,b=new Date().toISOString();return await t.DB.prepare(`
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
      `).bind(parseInt(l),e||null,E||null,a||null,c||null,p||null,m||null,w,y,b).run(),new Response(JSON.stringify({ok:!0}),{headers:o})}catch(n){return new Response(JSON.stringify({ok:!1,message:n.message}),{status:500,headers:o})}if(d.startsWith("/works/variety-similar/")&&i.method==="GET"){let n=parseInt(d.split("/works/variety-similar/")[1]);if(!n)return new Response(JSON.stringify({ok:!1,message:"tmdb_id required"}),{status:400,headers:o});let l=Math.min(parseInt(s.searchParams.get("limit")||"10"),20);try{let r=((await t.DB.prepare("SELECT variety_genre FROM works WHERE tmdb_id = ?").bind(n).first())?.variety_genre||"").split(",").map(m=>m.trim()).filter(Boolean);if(!r.length)return new Response(JSON.stringify({ok:!0,data:[]}),{headers:o});let{results:a}=await t.DB.prepare(`
        SELECT tmdb_id, title_ko, title_en, poster_path, tmdb_rating, release_year, variety_genre, media_type
        FROM works
        WHERE variety_genre IS NOT NULL AND variety_genre != '' AND tmdb_id != ?
      `).bind(n).all(),c=new Map;try{let m=await t.DB.prepare("SELECT MAX(date) as d FROM rankings WHERE date != 'manual'").first();if(m?.d){let{results:_}=await t.DB.prepare(`
            SELECT tmdb_id, COUNT(DISTINCT platform) as cnt
            FROM rankings
            WHERE date = ?
            GROUP BY tmdb_id
          `).bind(m.d).all();for(let u of _)c.set(u.tmdb_id,u.cnt)}}catch{}let p=[];for(let m of a){let _=(m.variety_genre||"").split(",").map(w=>w.trim()).filter(Boolean),u=r.filter(w=>_.includes(w)).length;if(!u)continue;let g=null;if(r.length===2?g=u===2?92:82:r.length===1&&(g=u===1?87:null),!g)continue;let k=c.get(m.tmdb_id)||0,E=Math.min(g+k,99);p.push({tmdb_id:m.tmdb_id,title_ko:m.title_ko,title_en:m.title_en,poster_path:m.poster_path,tmdb_rating:m.tmdb_rating,release_year:m.release_year,match_pct:E,media_type:m.media_type||null})}return p.sort((m,_)=>_.match_pct-m.match_pct||(_.release_year||0)-(m.release_year||0)||(_.tmdb_rating||0)-(m.tmdb_rating||0)),new Response(JSON.stringify({ok:!0,data:p.slice(0,l)}),{headers:o})}catch(e){return new Response(JSON.stringify({ok:!1,message:e.message}),{status:500,headers:o})}}if(d.startsWith("/works/")&&i.method==="GET"){let n=d.split("/works/")[1];if(!n)return new Response(JSON.stringify({ok:!1,message:"tmdb_id required"}),{status:400,headers:o});let{results:l}=await t.DB.prepare("SELECT * FROM works WHERE tmdb_id = ?").bind(parseInt(n)).all();if(!l.length)return new Response(JSON.stringify({ok:!1,message:"Not found"}),{status:404,headers:o});let e={...l[0]};if(!e.mbti_tags&&e.genre){let u=yt(e.genre);u&&(f.waitUntil(t.DB.prepare("UPDATE works SET mbti_tags = ? WHERE tmdb_id = ?").bind(u,parseInt(n)).run()),e.mbti_tags=u)}let r=7200*60*1e3,a=2400*60*60*1e3,c=!1;try{let{results:u}=await t.DB.prepare(`
        SELECT 1 FROM rankings
        WHERE tmdb_id = ? AND date = (SELECT MAX(date) FROM rankings WHERE date != 'manual')
        LIMIT 1
      `).bind(parseInt(n)).all();c=!!(u&&u.length)}catch{c=!1}let p=c?r:a;if(!e.keyword_preview_updated_at||Date.now()-new Date(e.keyword_preview_updated_at).getTime()>p){let u={keyword:null,items:[]};if(e.keywords&&e.keywords!=="__NONE__"){let k=e.keywords.split(",").map(E=>E.trim()).filter(Boolean).slice(0,10);if(k.length)try{let E=k.map(y=>t.DB.prepare(`
                SELECT w.tmdb_id, w.title_ko, w.title_en, w.poster_path, w.original_language, w.tmdb_rating
                FROM work_keywords wk
                JOIN works w ON w.tmdb_id = wk.tmdb_id
                WHERE wk.keyword = ?
                  AND wk.tmdb_id != ?
                ORDER BY
                  CASE WHEN w.original_language = 'ko' THEN 0 ELSE 1 END,
                  w.tmdb_rating DESC
                LIMIT 20
              `).bind(y.toLowerCase(),parseInt(n))),w=await t.DB.batch(E);for(let y=0;y<k.length;y++){let b=w[y]?.results||[];if(b.length>=3){u={keyword:k[y],items:b};break}}}catch{}}let g=new Date().toISOString();e.keyword_preview=JSON.stringify(u),e.keyword_preview_updated_at=g,f.waitUntil(t.DB.prepare("UPDATE works SET keyword_preview = ?, keyword_preview_updated_at = ? WHERE tmdb_id = ?").bind(e.keyword_preview,g,parseInt(n)).run())}try{let{results:u}=await t.DB.prepare(`
        SELECT w.tmdb_id, w.title_ko, w.title_en, w.poster_path, w.release_year, w.media_type, p.pinned_pct
        FROM work_pinned_similar p
        JOIN works w ON w.tmdb_id = p.related_tmdb_id
        WHERE p.tmdb_id = ?
        ORDER BY p.pinned_pct DESC
      `).bind(parseInt(n)).all();e.pinned_similar=u||[]}catch{e.pinned_similar=[]}if(!e.keyword_ko_map_updated_at||Date.now()-new Date(e.keyword_ko_map_updated_at).getTime()>p){let u={},g=!1;if(e.keywords&&e.keywords!=="__NONE__"){let k=e.keywords.split(",").map(E=>E.trim().toLowerCase()).filter(Boolean);if(k.length)try{let E=k.map(()=>"?").join(","),{results:w}=await t.DB.prepare(`SELECT keyword_en, keyword_ko FROM keyword_translation WHERE keyword_en IN (${E}) AND source = 'admin'`).bind(...k).all();for(let y of w||[])u[y.keyword_en]=y.keyword_ko}catch{g=!0}}if(e.keyword_ko_map=u,!g){let k=new Date().toISOString();f.waitUntil(t.DB.prepare("UPDATE works SET keyword_ko_map = ?, keyword_ko_map_updated_at = ? WHERE tmdb_id = ?").bind(JSON.stringify(u),k,parseInt(n)).run())}}else try{e.keyword_ko_map=e.keyword_ko_map?JSON.parse(e.keyword_ko_map):{}}catch{e.keyword_ko_map={}}return new Response(JSON.stringify({ok:!0,data:e}),{headers:o})}if(d==="/search/keyword"&&i.method==="GET"){let n=(s.searchParams.get("keyword")||"").trim().toLowerCase(),l=Math.min(parseInt(s.searchParams.get("limit")||"20"),40);if(!n)return new Response(JSON.stringify({ok:!1,message:"keyword required"}),{status:400,headers:o});try{let{results:e}=await t.DB.prepare(`
        SELECT w.tmdb_id, w.title_ko, w.title_en, w.poster_path, w.genre, w.tmdb_rating, w.media_type, w.original_language
        FROM work_keywords wk
        JOIN works w ON w.tmdb_id = wk.tmdb_id
        WHERE wk.keyword = ?
        ORDER BY
          CASE WHEN w.original_language = 'ko' THEN 0 ELSE 1 END,
          w.tmdb_rating DESC
        LIMIT ?
      `).bind(n,l).all();return new Response(JSON.stringify({ok:!0,keyword:n,data:e}),{headers:o})}catch(e){return new Response(JSON.stringify({ok:!1,message:e.message}),{status:500,headers:o})}}return null}function yt(d){if(!d)return null;let i=new Set(["Reality","Talk","News","Soap","Documentary","Kids","\uB2E4\uD050\uBA58\uD130\uB9AC","\uB9AC\uC5BC\uB9AC\uD2F0"]),t=d.split(",").map(a=>a.trim()).filter(Boolean);if(!t.length||!t.filter(a=>!i.has(a)).length)return null;let s=a=>a===0?5:a===1?3:a===2?2:1,o={INTJ:{primary:["Science Fiction","Sci-Fi & Fantasy","SF"],secondary:["Drama","\uB4DC\uB77C\uB9C8","Thriller","\uC2A4\uB9B4\uB7EC"]},INTP:{primary:["Science Fiction","Sci-Fi & Fantasy","SF"],secondary:["Thriller","Mystery","\uC2A4\uB9B4\uB7EC","\uBBF8\uC2A4\uD130\uB9AC"]},ENTJ:{primary:["Drama","\uB4DC\uB77C\uB9C8"],secondary:["Science Fiction","Sci-Fi & Fantasy","SF"]},ENTP:{primary:["Science Fiction","Sci-Fi & Fantasy","SF"],secondary:["Action","Action & Adventure","\uC561\uC158","Adventure","\uBAA8\uD5D8"]},INFJ:{primary:["Thriller","Mystery","\uC2A4\uB9B4\uB7EC","\uBBF8\uC2A4\uD130\uB9AC"],secondary:["Drama","\uB4DC\uB77C\uB9C8","Crime","\uBC94\uC8C4"]},INFP:{primary:["Fantasy","Sci-Fi & Fantasy","\uD310\uD0C0\uC9C0"],secondary:["Drama","\uB4DC\uB77C\uB9C8","Animation","\uC560\uB2C8\uBA54\uC774\uC158"]},ENFJ:{primary:["Fantasy","Sci-Fi & Fantasy","\uD310\uD0C0\uC9C0"],secondary:["Drama","\uB4DC\uB77C\uB9C8","Family","\uAC00\uC871"]},ENFP:{primary:["Drama","\uB4DC\uB77C\uB9C8"],secondary:["Comedy","\uCF54\uBBF8\uB514","Fantasy","\uD310\uD0C0\uC9C0"]},ISTJ:{primary:["Drama","\uB4DC\uB77C\uB9C8"],secondary:["Action","Action & Adventure","\uC561\uC158","History","\uC5ED\uC0AC","War","War & Politics","\uC804\uC7C1"]},ISFJ:{primary:["Comedy","\uCF54\uBBF8\uB514"],secondary:["Romance","\uB85C\uB9E8\uC2A4","Family","\uAC00\uC871","Drama","\uB4DC\uB77C\uB9C8"]},ESTJ:{primary:["Action","Action & Adventure","\uC561\uC158"],secondary:["Drama","\uB4DC\uB77C\uB9C8","History","\uC5ED\uC0AC","War","War & Politics","\uC804\uC7C1"]},ESFJ:{primary:["Action","Action & Adventure","\uC561\uC158"],secondary:["Comedy","\uCF54\uBBF8\uB514","Family","\uAC00\uC871","Romance","\uB85C\uB9E8\uC2A4"]},ISTP:{primary:["Horror","Thriller","\uACF5\uD3EC","\uC2A4\uB9B4\uB7EC"],secondary:["Action","Action & Adventure","\uC561\uC158","Crime","\uBC94\uC8C4"]},ISFP:{primary:["Drama","\uB4DC\uB77C\uB9C8"],secondary:["Animation","\uC560\uB2C8\uBA54\uC774\uC158","Romance","\uB85C\uB9E8\uC2A4","Music","\uC74C\uC545"]},ESTP:{primary:["Action","Action & Adventure","\uC561\uC158"],secondary:["Thriller","Mystery","Crime","\uC2A4\uB9B4\uB7EC","\uBBF8\uC2A4\uD130\uB9AC","\uBC94\uC8C4"]},ESFP:{primary:["Comedy","\uCF54\uBBF8\uB514"],secondary:["Action","Action & Adventure","\uC561\uC158","Romance","\uB85C\uB9E8\uC2A4"]}},n={};for(let[a,c]of Object.entries(o)){let p=0;t.forEach((m,_)=>{let u=s(_);c.primary.includes(m)?p+=u*3:c.secondary.includes(m)&&(p+=u*1)}),p>0&&(n[a]=p)}if(!Object.keys(n).length)return null;let l=parseInt(d.split("").reduce((a,c)=>a+c.charCodeAt(0),0)),e=a=>{let c=Math.sin(l+a*127)*43758.5453;return c-Math.floor(c)},r=Object.entries(n);return r.sort((a,c)=>{if(c[1]!==a[1])return c[1]-a[1];let p=r.indexOf(a),m=r.indexOf(c);return e(p)-e(m)}),r.slice(0,5).map(([a])=>a).join(",")}async function q(d,i,t,f,s){if(d==="/reactions"&&i.method==="GET"){let o=new URL(i.url),n=o.searchParams.get("tmdb_id"),l=o.searchParams.get("featured"),e=parseInt(o.searchParams.get("page")||"1"),r=20,a=(e-1)*r,c,p;l==="1"?(c="SELECT * FROM reactions WHERE is_featured = 1 ORDER BY created_at DESC LIMIT 1",p=[]):n?(c="SELECT * FROM reactions WHERE tmdb_id = ? ORDER BY is_featured DESC, like_count DESC, created_at DESC",p=[parseInt(n)]):(c="SELECT * FROM reactions ORDER BY is_featured DESC, created_at DESC LIMIT ? OFFSET ?",p=[r,a]);let{results:m}=p.length?await t.DB.prepare(c).bind(...p).all():await t.DB.prepare(c).all();return new Response(JSON.stringify({ok:!0,data:m}),{headers:s})}if(d.match(/^\/reactions\/work\/\d+$/)&&i.method==="GET")try{let o=parseInt(d.split("/")[3]),n=["great","good","meh","bad"],{results:l}=await t.DB.prepare(`
        SELECT reaction, COUNT(*) as cnt
        FROM work_reactions
        WHERE tmdb_id = ?
        GROUP BY reaction
      `).bind(o).all(),e=l.reduce((m,_)=>m+_.cnt,0),r={};n.forEach(m=>r[m]=0),l.forEach(m=>{n.includes(m.reaction)&&(r[m.reaction]=m.cnt)});let a={};if(e>0){let m=0,_=n.map(u=>({k:u,raw:r[u]/e*100}));_.forEach((u,g)=>{g<_.length-1?(a[u.k]=Math.round(u.raw),m+=a[u.k]):a[u.k]=100-m})}else n.forEach(m=>a[m]=0);let c=null,p=i.headers.get("Authorization")?.replace("Bearer ","")||(()=>{let _=(i.headers.get("Cookie")||"").match(/session=([^;]+)/);return _?_[1]:null})();if(p){let m=await t.DB.prepare("SELECT user_id FROM sessions WHERE id = ? AND expires_at > datetime('now') LIMIT 1").bind(p).first();m?.user_id&&(c=(await t.DB.prepare("SELECT reaction FROM work_reactions WHERE tmdb_id = ? AND user_id = ? LIMIT 1").bind(o,m.user_id).first())?.reaction||null)}return new Response(JSON.stringify({ok:!0,data:{total:e,counts:r,ratios:a,my_reaction:c}}),{headers:s})}catch(o){return new Response(JSON.stringify({ok:!1,message:o.message}),{status:500,headers:s})}if(d==="/reactions/work"&&i.method==="POST")try{let o=i.headers.get("Authorization")?.replace("Bearer ","")||(()=>{let w=(i.headers.get("Cookie")||"").match(/session=([^;]+)/);return w?w[1]:null})();if(!o)return new Response(JSON.stringify({ok:!1,message:"\uB85C\uADF8\uC778\uC774 \uD544\uC694\uD569\uB2C8\uB2E4"}),{status:401,headers:s});let n=await t.DB.prepare("SELECT user_id FROM sessions WHERE id = ? AND expires_at > datetime('now') LIMIT 1").bind(o).first();if(!n?.user_id)return new Response(JSON.stringify({ok:!1,message:"\uC138\uC158\uC774 \uB9CC\uB8CC\uB410\uC2B5\uB2C8\uB2E4"}),{status:401,headers:s});let l=await i.json(),{tmdb_id:e,reaction:r}=l,a=["great","good","meh","bad"];if(!e||!a.includes(r))return new Response(JSON.stringify({ok:!1,message:"\uC62C\uBC14\uB974\uC9C0 \uC54A\uC740 \uC694\uCCAD\uC785\uB2C8\uB2E4"}),{status:400,headers:s});let c=n.user_id;await t.DB.prepare(`
        INSERT INTO work_reactions (tmdb_id, user_id, reaction, updated_at)
        VALUES (?, ?, ?, datetime('now'))
        ON CONFLICT(tmdb_id, user_id)
        DO UPDATE SET reaction = excluded.reaction, updated_at = datetime('now')
      `).bind(parseInt(e),c,r).run();let{results:p}=await t.DB.prepare(`
        SELECT reaction, COUNT(*) as cnt
        FROM work_reactions
        WHERE tmdb_id = ?
        GROUP BY reaction
      `).bind(parseInt(e)).all(),m=p.reduce((E,w)=>E+w.cnt,0),_={};a.forEach(E=>_[E]=0),p.forEach(E=>{a.includes(E.reaction)&&(_[E.reaction]=E.cnt)});let u={},g=0,k=a.map(E=>({k:E,raw:_[E]/m*100}));return k.forEach((E,w)=>{w<k.length-1?(u[E.k]=Math.round(E.raw),g+=u[E.k]):u[E.k]=100-g}),new Response(JSON.stringify({ok:!0,data:{total:m,counts:_,ratios:u,my_reaction:r}}),{headers:s})}catch(o){return new Response(JSON.stringify({ok:!1,message:o.message}),{status:500,headers:s})}if(d.match(/^\/reactions\/\d+\/comments$/)&&i.method==="GET"){let o=parseInt(d.split("/")[2]),{results:n}=await t.DB.prepare("SELECT * FROM reaction_comments WHERE reaction_id = ? ORDER BY like_count DESC LIMIT 50").bind(o).all();return new Response(JSON.stringify({ok:!0,data:n}),{headers:s})}if(d.match(/^\/reactions\/\d+\/posts$/)&&i.method==="GET"){let o=parseInt(d.split("/")[2]),{results:n}=await t.DB.prepare("SELECT * FROM reaction_posts WHERE reaction_id = ? ORDER BY created_at DESC").bind(o).all();return new Response(JSON.stringify({ok:!0,data:n}),{headers:s})}if(d.match(/^\/reactions\/\d+\/posts$/)&&i.method==="POST")try{let o=parseInt(d.split("/")[2]),n=i.headers.get("Authorization")||"",l=n.startsWith("Bearer ")?n.slice(7).trim():null,e=h(i),r=l||e;if(!r)return new Response(JSON.stringify({ok:!1,message:"\uB85C\uADF8\uC778\uC774 \uD544\uC694\uD569\uB2C8\uB2E4."}),{status:401,headers:s});let a=await t.DB.prepare(`SELECT s.user_id AS id, u.nickname
         FROM sessions s
         JOIN users u ON u.id = s.user_id
         WHERE s.id = ?
         LIMIT 1`).bind(r).first();if(!a)return new Response(JSON.stringify({ok:!1,message:"\uB85C\uADF8\uC778\uC774 \uD544\uC694\uD569\uB2C8\uB2E4."}),{status:401,headers:s});let c=await i.json(),{is_spoiler:p,tmdb_id:m}=c,_=(c.content||"").trim();if(!_)return new Response(JSON.stringify({ok:!1,message:"\uB313\uAE00 \uB0B4\uC6A9\uC744 \uC785\uB825\uD574\uC8FC\uC138\uC694"}),{status:400,headers:s});if(_.length>500)return new Response(JSON.stringify({ok:!1,message:"\uB313\uAE00\uC740 500\uC790 \uC774\uB0B4\uB85C \uC785\uB825\uD574\uC8FC\uC138\uC694"}),{status:400,headers:s});let u=await t.DB.prepare(`
        INSERT INTO reaction_posts (reaction_id, tmdb_id, user_id, nickname, content, is_spoiler)
        VALUES (?, ?, ?, ?, ?, ?)
      `).bind(o,m||0,a.id,a.nickname,_,p?1:0).run();return new Response(JSON.stringify({ok:!0,id:u.meta?.last_row_id,nickname:a.nickname}),{headers:s})}catch(o){return new Response(JSON.stringify({ok:!1,message:o.message}),{status:500,headers:s})}if(d.match(/^\/reactions\/posts\/\d+$/)&&i.method==="DELETE")try{let o=parseInt(d.split("/")[3]),n=i.headers.get("Authorization")||"",l=n.startsWith("Bearer ")?n.slice(7).trim():null,e=h(i),r=l||e;if(!r)return new Response(JSON.stringify({ok:!1,message:"\uB85C\uADF8\uC778\uC774 \uD544\uC694\uD569\uB2C8\uB2E4."}),{status:401,headers:s});let a=await t.DB.prepare("SELECT s.user_id AS id FROM sessions s WHERE s.id = ? LIMIT 1").bind(r).first();if(!a)return new Response(JSON.stringify({ok:!1,message:"\uB85C\uADF8\uC778\uC774 \uD544\uC694\uD569\uB2C8\uB2E4."}),{status:401,headers:s});let c=await t.DB.prepare("SELECT id, user_id FROM reaction_posts WHERE id = ?").bind(o).first();return c?c.user_id!==a.id?new Response(JSON.stringify({ok:!1,message:"\uBCF8\uC778 \uB313\uAE00\uB9CC \uC0AD\uC81C\uD560 \uC218 \uC788\uC2B5\uB2C8\uB2E4."}),{status:403,headers:s}):(await t.DB.prepare("DELETE FROM reaction_posts WHERE id = ?").bind(o).run(),new Response(JSON.stringify({ok:!0}),{headers:s})):new Response(JSON.stringify({ok:!1,message:"\uB313\uAE00\uC744 \uCC3E\uC744 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4."}),{status:404,headers:s})}catch(o){return new Response(JSON.stringify({ok:!1,message:o.message}),{status:500,headers:s})}if(d.match(/^\/reactions\/posts\/\d+\/like$/)&&i.method==="POST")try{let o=parseInt(d.split("/")[3]);return await t.DB.prepare("UPDATE reaction_posts SET like_count = like_count + 1 WHERE id = ?").bind(o).run(),new Response(JSON.stringify({ok:!0}),{headers:s})}catch(o){return new Response(JSON.stringify({ok:!1,message:o.message}),{status:500,headers:s})}if(d==="/admin/reactions"&&i.method==="POST"){if(!O(i,t))return new Response(JSON.stringify({ok:!1,message:"Unauthorized"}),{status:401,headers:s});try{let o=await i.json(),{tmdb_id:n,title_ko:l,poster_path:e,video_id:r,video_title:a,channel_name:c,thumbnail:p,view_count:m,like_count:_,published_at:u,custom_title:g}=o;if(!n||!r)return new Response(JSON.stringify({ok:!1,message:"tmdb_id and video_id required"}),{status:400,headers:s});await t.DB.prepare(`
        INSERT OR REPLACE INTO reactions
          (tmdb_id, title_ko, poster_path, platform, video_id, video_title,
           custom_title, channel_name, thumbnail, view_count, like_count, published_at, is_manual)
        VALUES (?, ?, ?, 'youtube', ?, ?, ?, ?, ?, ?, ?, ?, 1)
      `).bind(parseInt(n),l||"",e||"",r,a||"",g||a||"",c||"",p||"",m||0,_||0,u||new Date().toISOString()).run();let E=(await t.DB.prepare("SELECT id FROM reactions WHERE video_id = ? LIMIT 1").bind(r).first())?.id;return E&&t.YOUTUBE_API_KEY&&t.ANTHROPIC_API_KEY&&f.waitUntil(j(E,r,parseInt(n),t)),new Response(JSON.stringify({ok:!0,reaction_id:E,collecting:!!(E&&t.YOUTUBE_API_KEY),message:t.YOUTUBE_API_KEY?"\uB4F1\uB85D \uC644\uB8CC! \uB313\uAE00 \uC218\uC9D1\xB7\uBC88\uC5ED \uC911 (\uC57D 30\uCD08 \uD6C4 \uD45C\uC2DC)":"\uB4F1\uB85D \uC644\uB8CC"}),{headers:s})}catch(o){return new Response(JSON.stringify({ok:!1,message:o.message}),{status:500,headers:s})}}if(d.match(/^\/admin\/reactions\/\d+\/collect$/)&&i.method==="POST"){if(!O(i,t))return new Response(JSON.stringify({ok:!1,message:"Unauthorized"}),{status:401,headers:s});try{let o=parseInt(d.split("/")[3]),n=await t.DB.prepare("SELECT id, video_id, tmdb_id FROM reactions WHERE id = ? LIMIT 1").bind(o).first();return n?t.YOUTUBE_API_KEY?(f.waitUntil(j(n.id,n.video_id,n.tmdb_id,t)),new Response(JSON.stringify({ok:!0,message:"\uB313\uAE00 \uC218\uC9D1\xB7\uBC88\uC5ED \uC2DC\uC791! \uC57D 30\uCD08 \uD6C4 \uD655\uC778\uD558\uC138\uC694"}),{headers:s})):new Response(JSON.stringify({ok:!1,message:"YOUTUBE_API_KEY not set"}),{status:500,headers:s}):new Response(JSON.stringify({ok:!1,message:"reaction not found"}),{status:404,headers:s})}catch(o){return new Response(JSON.stringify({ok:!1,message:o.message}),{status:500,headers:s})}}if(d.match(/^\/admin\/reactions\/\d+$/)&&i.method==="PATCH"){if(!O(i,t))return new Response(JSON.stringify({ok:!1,message:"Unauthorized"}),{status:401,headers:s});try{let o=parseInt(d.split("/")[3]),n=await i.json(),{custom_title:l,is_featured_off:e}=n;return e?await t.DB.prepare("UPDATE reactions SET is_featured = 0 WHERE id = ?").bind(o).run():await t.DB.prepare("UPDATE reactions SET custom_title = ? WHERE id = ?").bind(l||"",o).run(),new Response(JSON.stringify({ok:!0}),{headers:s})}catch(o){return new Response(JSON.stringify({ok:!1,message:o.message}),{status:500,headers:s})}}if(d.match(/^\/admin\/reactions\/\d+\/featured$/)&&i.method==="PUT"){if(!O(i,t))return new Response(JSON.stringify({ok:!1,message:"Unauthorized"}),{status:401,headers:s});try{let o=parseInt(d.split("/")[3]);return await t.DB.prepare("UPDATE reactions SET is_featured = 0").run(),await t.DB.prepare("UPDATE reactions SET is_featured = 1 WHERE id = ?").bind(o).run(),new Response(JSON.stringify({ok:!0}),{headers:s})}catch(o){return new Response(JSON.stringify({ok:!1,message:o.message}),{status:500,headers:s})}}if(d.match(/^\/admin\/reactions\/\d+$/)&&i.method==="DELETE"){if(!O(i,t))return new Response(JSON.stringify({ok:!1,message:"Unauthorized"}),{status:401,headers:s});try{let o=parseInt(d.split("/")[3]);return await t.DB.prepare("DELETE FROM reactions WHERE id = ?").bind(o).run(),await t.DB.prepare("DELETE FROM reaction_comments WHERE reaction_id = ?").bind(o).run(),await t.DB.prepare("DELETE FROM reaction_posts WHERE reaction_id = ?").bind(o).run(),new Response(JSON.stringify({ok:!0}),{headers:s})}catch(o){return new Response(JSON.stringify({ok:!1,message:o.message}),{status:500,headers:s})}}return null}var $=["\uADC0\uC5EC\uC6B4","\uC6A9\uAC10\uD55C","\uC2E0\uBE44\uB85C\uC6B4","\uC5C9\uB6B1\uD55C","\uC870\uC6A9\uD55C","\uD65C\uBC1C\uD55C","\uB290\uAE0B\uD55C","\uC5F4\uC815\uC801\uC778","\uB0AD\uB9CC\uC801\uC778","\uC9C4\uC9C0\uD55C","\uC720\uCF8C\uD55C","\uB2F9\uB2F9\uD55C","\uC218\uC90D\uC740","\uB3C5\uD2B9\uD55C","\uBE60\uB978","\uB530\uB73B\uD55C","\uCC28\uAC00\uC6B4","\uBC30\uACE0\uD508","\uC878\uB9B0","\uBA4B\uC9C4","\uD669\uB2F9\uD55C","\uC9C4\uC9C0\uD55C","\uB290\uB9B0","\uC601\uB9AC\uD55C","\uAC15\uD55C"];async function tt(d,i,t,f){let s=new URL(i.url);if(d==="/auth/google"&&i.method==="GET"){let o=s.searchParams.get("redirect")||"",n="https://accounts.google.com/o/oauth2/v2/auth?client_id="+t.GOOGLE_CLIENT_ID+"&redirect_uri="+encodeURIComponent("https://ottrank-api.tdidream.workers.dev/auth/google/callback")+"&response_type=code&scope="+encodeURIComponent("openid email profile")+"&access_type=offline"+(o?"&state="+encodeURIComponent(o):"");return Response.redirect(n,302)}if(d==="/auth/google/callback"&&i.method==="GET"){let o=s.searchParams.get("code");if(!o)return Response.redirect("https://ottrank.kr?login=fail",302);try{let l=await(await fetch("https://oauth2.googleapis.com/token",{method:"POST",headers:{"Content-Type":"application/x-www-form-urlencoded"},body:new URLSearchParams({grant_type:"authorization_code",client_id:t.GOOGLE_CLIENT_ID,client_secret:t.GOOGLE_CLIENT_SECRET,redirect_uri:"https://ottrank-api.tdidream.workers.dev/auth/google/callback",code:o})})).json();if(!l.access_token)return Response.redirect("https://ottrank.kr?login=fail",302);let r=await(await fetch("https://www.googleapis.com/oauth2/v2/userinfo",{headers:{Authorization:"Bearer "+l.access_token}})).json(),a=String(r.id),c=r.email||"",p=r.picture||"",m=await t.DB.prepare("SELECT id, nickname FROM users WHERE provider = 'google' AND provider_id = ?").bind(a).first();await t.DB.prepare(`
        INSERT INTO users (provider, provider_id, nickname, email, avatar_url, last_login)
        VALUES ('google', ?, null, ?, ?, datetime('now'))
        ON CONFLICT(provider, provider_id) DO UPDATE SET
          email      = excluded.email,
          avatar_url = excluded.avatar_url,
          last_login = datetime('now')
      `).bind(a,c,p).run();let _=await t.DB.prepare("SELECT id, nickname, last_login_bonus_date FROM users WHERE provider = 'google' AND provider_id = ?").bind(a).first(),u=!m||!m.nickname||m.nickname.trim()==="",g=crypto.randomUUID(),k=new Date(Date.now()+720*60*60*1e3).toISOString();await t.DB.prepare("INSERT INTO sessions (id, user_id, expires_at) VALUES (?, ?, ?)").bind(g,_.id,k).run();let E=s.searchParams.get("state")||"",w=E?decodeURIComponent(E):"";if(!u){let b=new Date(Date.now()+324e5).toISOString().slice(0,10);_.last_login_bonus_date!==b&&(await H(_.id,3,"login",t),await t.DB.prepare("UPDATE users SET last_login_bonus_date = ? WHERE id = ?").bind(b,_.id).run())}let y=u?`https://ottrank.kr/signup.html?sid=${g}`+(w?`&redirect=${encodeURIComponent(w)}`:""):`https://ottrank.kr/mypage.html?sid=${g}`;return new Response(null,{status:302,headers:{Location:y,"Set-Cookie":`session=${g}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${720*60*60}`}})}catch(n){return console.error("[AUTH] \uAD6C\uAE00 \uCF5C\uBC31 \uC624\uB958:",n.message),Response.redirect("https://ottrank.kr?login=fail",302)}}if(d==="/auth/naver"&&i.method==="GET"){let o=s.searchParams.get("redirect")||"",n=o?encodeURIComponent(o):crypto.randomUUID(),l="https://nid.naver.com/oauth2.0/authorize?client_id="+t.NAVER_CLIENT_ID+"&redirect_uri="+encodeURIComponent("https://ottrank-api.tdidream.workers.dev/auth/naver/callback")+"&response_type=code&state="+n;return Response.redirect(l,302)}if(d==="/auth/naver/callback"&&i.method==="GET"){let o=s.searchParams.get("code");if(!o)return Response.redirect("https://ottrank.kr?login=fail",302);try{let l=await(await fetch("https://nid.naver.com/oauth2.0/token",{method:"POST",headers:{"Content-Type":"application/x-www-form-urlencoded"},body:new URLSearchParams({grant_type:"authorization_code",client_id:t.NAVER_CLIENT_ID,client_secret:t.NAVER_CLIENT_SECRET,redirect_uri:"https://ottrank-api.tdidream.workers.dev/auth/naver/callback",code:o,state:s.searchParams.get("state")||""})})).json();if(!l.access_token)return Response.redirect("https://ottrank.kr?login=fail",302);let a=(await(await fetch("https://openapi.naver.com/v1/nid/me",{headers:{Authorization:"Bearer "+l.access_token}})).json()).response,c=String(a.id),p=a.email||"",m=a.profile_image||"",_=await t.DB.prepare("SELECT id, nickname FROM users WHERE provider = 'naver' AND provider_id = ?").bind(c).first();await t.DB.prepare(`
        INSERT INTO users (provider, provider_id, nickname, email, avatar_url, last_login)
        VALUES ('naver', ?, '', ?, ?, datetime('now'))
        ON CONFLICT(provider, provider_id) DO UPDATE SET
          email      = excluded.email,
          avatar_url = excluded.avatar_url,
          last_login = datetime('now')
      `).bind(c,p,m).run();let u=await t.DB.prepare("SELECT id, nickname, last_login_bonus_date FROM users WHERE provider = 'naver' AND provider_id = ?").bind(c).first(),g=!_||!_.nickname||_.nickname.trim()==="",k=crypto.randomUUID(),E=new Date(Date.now()+720*60*60*1e3).toISOString();await t.DB.prepare("INSERT INTO sessions (id, user_id, expires_at) VALUES (?, ?, ?)").bind(k,u.id,E).run();let w=s.searchParams.get("state")||"",y="";try{y=w?decodeURIComponent(w):""}catch{}if(y.startsWith("/")||(y=""),!g){let N=new Date(Date.now()+324e5).toISOString().slice(0,10);u.last_login_bonus_date!==N&&(await H(u.id,3,"login",t),await t.DB.prepare("UPDATE users SET last_login_bonus_date = ? WHERE id = ?").bind(N,u.id).run())}let b=g?`https://ottrank.kr/signup.html?sid=${k}`+(y?`&redirect=${encodeURIComponent(y)}`:""):`https://ottrank.kr/mypage.html?sid=${k}`;return new Response(null,{status:302,headers:{Location:b,"Set-Cookie":`session=${k}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${720*60*60}`}})}catch(n){return console.error("[AUTH] \uB124\uC774\uBC84 \uCF5C\uBC31 \uC624\uB958:",n.message),Response.redirect("https://ottrank.kr?login=fail",302)}}if(d==="/auth/kakao"&&i.method==="GET"){let o=s.searchParams.get("redirect")||"",n=o?encodeURIComponent(o):"",l="https://kauth.kakao.com/oauth/authorize?client_id="+t.KAKAO_CLIENT_ID+"&redirect_uri="+encodeURIComponent("https://ottrank-api.tdidream.workers.dev/auth/kakao/callback")+"&response_type=code"+(n?"&state="+n:"");return Response.redirect(l,302)}if(d==="/auth/kakao/callback"&&i.method==="GET"){let o=s.searchParams.get("code");if(!o)return Response.redirect("https://ottrank.kr?login=fail",302);try{let l=await(await fetch("https://kauth.kakao.com/oauth/token",{method:"POST",headers:{"Content-Type":"application/x-www-form-urlencoded"},body:new URLSearchParams({grant_type:"authorization_code",client_id:t.KAKAO_CLIENT_ID,client_secret:t.KAKAO_CLIENT_SECRET,redirect_uri:"https://ottrank-api.tdidream.workers.dev/auth/kakao/callback",code:o})})).json();if(!l.access_token)return Response.redirect("https://ottrank.kr?login=fail",302);let r=await(await fetch("https://kapi.kakao.com/v2/user/me",{headers:{Authorization:"Bearer "+l.access_token}})).json(),a=String(r.id),c=r.kakao_account?.profile?.profile_image_url||"",p=r.kakao_account?.email||"",m=await t.DB.prepare("SELECT id, nickname FROM users WHERE provider = 'kakao' AND provider_id = ?").bind(a).first();await t.DB.prepare(`
        INSERT INTO users (provider, provider_id, nickname, email, avatar_url, last_login)
        VALUES ('kakao', ?, '', ?, ?, datetime('now'))
        ON CONFLICT(provider, provider_id) DO UPDATE SET
          email      = excluded.email,
          avatar_url = excluded.avatar_url,
          last_login = datetime('now')
      `).bind(a,p,c).run();let _=await t.DB.prepare("SELECT id, nickname, last_login_bonus_date FROM users WHERE provider = 'kakao' AND provider_id = ?").bind(a).first(),u=!m||!m.nickname||m.nickname.trim()==="",g=crypto.randomUUID(),k=new Date(Date.now()+720*60*60*1e3).toISOString();await t.DB.prepare("INSERT INTO sessions (id, user_id, expires_at) VALUES (?, ?, ?)").bind(g,_.id,k).run();let E=s.searchParams.get("state")||"",w=E?decodeURIComponent(E):"";if(!u){let b=new Date(Date.now()+324e5).toISOString().slice(0,10);_.last_login_bonus_date!==b&&(await H(_.id,3,"login",t),await t.DB.prepare("UPDATE users SET last_login_bonus_date = ? WHERE id = ?").bind(b,_.id).run())}let y=u?`https://ottrank.kr/signup.html?sid=${g}`+(w?`&redirect=${encodeURIComponent(w)}`:""):`https://ottrank.kr/mypage.html?sid=${g}`;return new Response(null,{status:302,headers:{Location:y,"Set-Cookie":`session=${g}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${720*60*60}`}})}catch(n){return console.error("[AUTH] \uCE74\uCE74\uC624 \uCF5C\uBC31 \uC624\uB958:",n.message),Response.redirect("https://ottrank.kr?login=fail",302)}}if(d==="/auth/me"&&i.method==="GET")try{let l=(i.headers.get("Authorization")||"").replace("Bearer ","").trim()||h(i);if(!l)return new Response(JSON.stringify({ok:!1}),{headers:f});let e=await t.DB.prepare("SELECT * FROM sessions WHERE id = ? AND expires_at > datetime('now')").bind(l).first();if(!e)return new Response(JSON.stringify({ok:!1}),{headers:f});let r=await t.DB.prepare("SELECT id, nickname, email, avatar_url, provider, grade, total_likes_received, mbti, ott_points, created_at, last_login_bonus_date FROM users WHERE id = ?").bind(e.user_id).first();if(!r)return new Response(JSON.stringify({ok:!1}),{headers:f});let a=new Date(Date.now()+540*60*1e3).toISOString().slice(0,10);r.last_login_bonus_date!==a&&(await H(r.id,3,"login",t),await t.DB.prepare("UPDATE users SET last_login_bonus_date = ? WHERE id = ?").bind(a,r.id).run(),r.ott_points=(r.ott_points||0)+3,r.last_login_bonus_date=a);let c=await t.DB.prepare("SELECT grade_name, grade_key, emoji_url, sort_order FROM grade_settings WHERE grade_key = ?").bind(r.grade||"rookie").first();return new Response(JSON.stringify({ok:!0,user:{...r,gradeInfo:c||null}}),{headers:f})}catch{return new Response(JSON.stringify({ok:!1}),{headers:f})}if(d==="/auth/random-nickname"&&i.method==="GET")try{let n=(await t.DB.prepare(`
        SELECT title_ko FROM works
        WHERE title_ko IS NOT NULL
          AND title_ko != ''
          AND length(title_ko) <= 10
        ORDER BY RANDOM()
        LIMIT 1
      `).first())?.title_ko||"\uB4DC\uB77C\uB9C8\uD32C",l=$[Math.floor(Math.random()*$.length)],e=Math.floor(Math.random()*9e3)+1e3,r=`${l}${n}${e}`;return r.length>20&&(r=`${l}${n.slice(0,6)}${e}`),new Response(JSON.stringify({ok:!0,nickname:r}),{headers:f})}catch{let n=$[Math.floor(Math.random()*$.length)],l=Math.floor(Math.random()*9e3)+1e3;return new Response(JSON.stringify({ok:!0,nickname:`${n}\uC2DC\uB124\uB9C8${l}`}),{headers:f})}if(d==="/auth/nickname"&&i.method==="POST")try{let o=await i.json(),{nickname:n,sid:l,mbti:e}=o,r=l||h(i);if(!r)return new Response(JSON.stringify({ok:!1,message:"\uB85C\uADF8\uC778\uC774 \uD544\uC694\uD574\uC694"}),{status:401,headers:f});let a=await t.DB.prepare("SELECT * FROM sessions WHERE id = ? AND expires_at > datetime('now')").bind(r).first();if(!a)return new Response(JSON.stringify({ok:!1,message:"\uC138\uC158\uC774 \uB9CC\uB8CC\uB410\uC5B4\uC694"}),{status:401,headers:f});if(!n||n.trim().length<2)return new Response(JSON.stringify({ok:!1,message:"\uB2C9\uB124\uC784\uC740 2\uC790 \uC774\uC0C1 \uC785\uB825\uD574\uC8FC\uC138\uC694"}),{status:400,headers:f});if(n.trim().length>20)return new Response(JSON.stringify({ok:!1,message:"\uB2C9\uB124\uC784\uC740 20\uC790 \uC774\uB0B4\uB85C \uC785\uB825\uD574\uC8FC\uC138\uC694"}),{status:400,headers:f});if(!/^[가-힣a-zA-Z0-9]+$/.test(n.trim()))return new Response(JSON.stringify({ok:!1,message:"\uD55C\uAE00, \uC601\uBB38, \uC22B\uC790\uB9CC \uC0AC\uC6A9\uD560 \uC218 \uC788\uC5B4\uC694"}),{status:400,headers:f});if(await t.DB.prepare("SELECT id FROM users WHERE nickname = ? AND id != ?").bind(n.trim(),a.user_id).first())return new Response(JSON.stringify({ok:!1,message:"\uC774\uBBF8 \uC0AC\uC6A9 \uC911\uC778 \uB2C9\uB124\uC784\uC774\uC5D0\uC694"}),{status:400,headers:f});let m=e&&["INTJ","INTP","ENTJ","ENTP","INFJ","INFP","ENFJ","ENFP","ISTJ","ISFJ","ESTJ","ESFJ","ISTP","ISFP","ESTP","ESFP"].includes(e)?e:null;return await t.DB.prepare("UPDATE users SET nickname = ?, mbti = ? WHERE id = ?").bind(n.trim(),m,a.user_id).run(),await t.DB.prepare("SELECT id FROM user_point_logs WHERE user_id = ? AND reason = 'signup' LIMIT 1").bind(a.user_id).first()||await H(a.user_id,30,"signup",t),m&&(await t.DB.prepare("SELECT id FROM user_point_logs WHERE user_id = ? AND reason = 'mbti_register' LIMIT 1").bind(a.user_id).first()||await H(a.user_id,20,"mbti_register",t)),new Response(JSON.stringify({ok:!0}),{headers:f})}catch(o){return new Response(JSON.stringify({ok:!1,message:o.message}),{status:500,headers:f})}if(d==="/auth/nickname"&&i.method==="PUT")try{let n=(i.headers.get("Authorization")||"").replace("Bearer ","").trim()||h(i);if(!n)return new Response(JSON.stringify({ok:!1,message:"\uB85C\uADF8\uC778 \uD544\uC694"}),{status:401,headers:f});let l=await t.DB.prepare("SELECT * FROM sessions WHERE id = ? AND expires_at > datetime('now')").bind(n).first();if(!l)return new Response(JSON.stringify({ok:!1,message:"\uC138\uC158 \uB9CC\uB8CC"}),{status:401,headers:f});let e=await i.json(),{nickname:r}=e;return!r||r.trim().length<2?new Response(JSON.stringify({ok:!1,message:"\uB2C9\uB124\uC784\uC740 2\uC790 \uC774\uC0C1 \uC785\uB825\uD574\uC8FC\uC138\uC694"}),{status:400,headers:f}):r.trim().length>20?new Response(JSON.stringify({ok:!1,message:"\uB2C9\uB124\uC784\uC740 20\uC790 \uC774\uB0B4\uB85C \uC785\uB825\uD574\uC8FC\uC138\uC694"}),{status:400,headers:f}):/^[가-힣a-zA-Z0-9]+$/.test(r.trim())?await t.DB.prepare("SELECT id FROM users WHERE nickname = ? AND id != ?").bind(r.trim(),l.user_id).first()?new Response(JSON.stringify({ok:!1,message:"\uC774\uBBF8 \uC0AC\uC6A9 \uC911\uC778 \uB2C9\uB124\uC784\uC774\uC5D0\uC694"}),{status:400,headers:f}):(await t.DB.prepare("UPDATE users SET nickname = ? WHERE id = ?").bind(r.trim(),l.user_id).run(),new Response(JSON.stringify({ok:!0}),{headers:f})):new Response(JSON.stringify({ok:!1,message:"\uD55C\uAE00, \uC601\uBB38, \uC22B\uC790\uB9CC \uC0AC\uC6A9\uD560 \uC218 \uC788\uC5B4\uC694"}),{status:400,headers:f})}catch(o){return new Response(JSON.stringify({ok:!1,message:o.message}),{status:500,headers:f})}if(d==="/auth/withdraw"&&i.method==="DELETE")try{let n=(i.headers.get("Authorization")||"").replace("Bearer ","").trim()||h(i);if(!n)return new Response(JSON.stringify({ok:!1,message:"\uB85C\uADF8\uC778 \uD544\uC694"}),{status:401,headers:f});let l=await t.DB.prepare("SELECT user_id FROM sessions WHERE id = ? AND expires_at > datetime('now')").bind(n).first();if(!l)return new Response(JSON.stringify({ok:!1,message:"\uC138\uC158 \uB9CC\uB8CC"}),{status:401,headers:f});let e=l.user_id;return await t.DB.prepare("DELETE FROM sessions  WHERE user_id = ?").bind(e).run(),await t.DB.prepare("DELETE FROM wishlist  WHERE user_id = ?").bind(e).run(),await t.DB.prepare("DELETE FROM reviews   WHERE user_id = ?").bind(e).run(),await t.DB.prepare("DELETE FROM posts     WHERE user_id = ?").bind(e).run(),await t.DB.prepare("DELETE FROM users     WHERE id = ?").bind(e).run(),new Response(JSON.stringify({ok:!0}),{headers:{...f,"Set-Cookie":"session=; Path=/; HttpOnly; Secure; Max-Age=0"}})}catch(o){return new Response(JSON.stringify({ok:!1,message:o.message}),{status:500,headers:f})}if(d==="/auth/mbti"&&i.method==="PATCH")try{let n=(i.headers.get("Authorization")||"").replace("Bearer ","").trim()||h(i);if(!n)return new Response(JSON.stringify({ok:!1,message:"\uB85C\uADF8\uC778 \uD544\uC694"}),{status:401,headers:f});let l=await t.DB.prepare("SELECT * FROM sessions WHERE id = ? AND expires_at > datetime('now')").bind(n).first();if(!l)return new Response(JSON.stringify({ok:!1,message:"\uC138\uC158 \uB9CC\uB8CC"}),{status:401,headers:f});let e=await i.json(),{mbti:r}=e,c=r&&["INTJ","INTP","ENTJ","ENTP","INFJ","INFP","ENFJ","ENFP","ISTJ","ISFJ","ESTJ","ESFJ","ISTP","ISFP","ESTP","ESFP"].includes(r)?r:null,p=await t.DB.prepare("SELECT mbti FROM users WHERE id = ?").bind(l.user_id).first();await t.DB.prepare("UPDATE users SET mbti = ? WHERE id = ?").bind(c,l.user_id).run();let m=!!p?.mbti,_=!!c;return!m&&_?await t.DB.prepare("SELECT id FROM user_point_logs WHERE user_id = ? AND reason = 'mbti_register' LIMIT 1").bind(l.user_id).first()||await H(l.user_id,20,"mbti_register",t):m&&!_&&await H(l.user_id,-20,"mbti_unregister",t),new Response(JSON.stringify({ok:!0,mbti:c}),{headers:f})}catch(o){return new Response(JSON.stringify({ok:!1,message:o.message}),{status:500,headers:f})}if(d==="/auth/logout"&&i.method==="POST")try{let l=(i.headers.get("Authorization")||"").replace("Bearer ","").trim()||h(i);return l&&await t.DB.prepare("DELETE FROM sessions WHERE id = ?").bind(l).run(),new Response(JSON.stringify({ok:!0}),{headers:{...f,"Set-Cookie":"session=; Path=/; HttpOnly; Secure; Max-Age=0"}})}catch(o){return new Response(JSON.stringify({ok:!1,message:o.message}),{status:500,headers:f})}return null}async function et(d,i,t,f,s){if(d==="/wishlist"&&i.method==="GET")try{let l=(i.headers.get("Authorization")||"").replace("Bearer ","").trim()||h(i);if(!l)return new Response(JSON.stringify({ok:!1,message:"\uB85C\uADF8\uC778 \uD544\uC694"}),{status:401,headers:s});let e=await t.DB.prepare("SELECT user_id FROM sessions WHERE id = ? AND expires_at > datetime('now')").bind(l).first();if(!e)return new Response(JSON.stringify({ok:!1}),{status:401,headers:s});let{results:r}=await t.DB.prepare("SELECT * FROM wishlist WHERE user_id = ? ORDER BY created_at DESC").bind(e.user_id).all();return new Response(JSON.stringify({ok:!0,data:r}),{headers:s})}catch(n){return new Response(JSON.stringify({ok:!1,message:n.message}),{status:500,headers:s})}if(d==="/wishlist"&&i.method==="POST")try{let l=(i.headers.get("Authorization")||"").replace("Bearer ","").trim()||h(i);if(!l)return new Response(JSON.stringify({ok:!1,message:"\uB85C\uADF8\uC778 \uD544\uC694"}),{status:401,headers:s});let e=await t.DB.prepare("SELECT user_id FROM sessions WHERE id = ? AND expires_at > datetime('now')").bind(l).first();if(!e)return new Response(JSON.stringify({ok:!1,message:"\uC138\uC158 \uB9CC\uB8CC"}),{status:401,headers:s});let r=await i.json(),{tmdb_id:a,title_ko:c,poster_path:p,release_year:m,category:_}=r;return a?await t.DB.prepare("SELECT id FROM wishlist WHERE user_id = ? AND tmdb_id = ?").bind(e.user_id,parseInt(a)).first()?(await t.DB.prepare("DELETE FROM wishlist WHERE user_id = ? AND tmdb_id = ?").bind(e.user_id,parseInt(a)).run(),f.waitUntil(F(e.user_id,t)),new Response(JSON.stringify({ok:!0,wishlisted:!1}),{headers:s})):(await t.DB.prepare("INSERT INTO wishlist (user_id, tmdb_id, title_ko, poster_path, release_year, category) VALUES (?, ?, ?, ?, ?, ?)").bind(e.user_id,parseInt(a),c||"",p||"",m||"",_||"movie").run(),f.waitUntil(H(e.user_id,1,"wishlist",t)),f.waitUntil(F(e.user_id,t)),new Response(JSON.stringify({ok:!0,wishlisted:!0}),{headers:s})):new Response(JSON.stringify({ok:!1,message:"tmdb_id \uD544\uC694"}),{status:400,headers:s})}catch(n){return new Response(JSON.stringify({ok:!1,message:n.message}),{status:500,headers:s})}if(d.match(/^\/wishlist\/check\/\d+$/)&&i.method==="GET")try{let n=parseInt(d.split("/")[3]),e=(i.headers.get("Authorization")||"").replace("Bearer ","").trim()||h(i);if(!e)return new Response(JSON.stringify({ok:!0,wishlisted:!1}),{headers:s});let r=await t.DB.prepare("SELECT user_id FROM sessions WHERE id = ? AND expires_at > datetime('now')").bind(e).first();if(!r)return new Response(JSON.stringify({ok:!0,wishlisted:!1}),{headers:s});let a=await t.DB.prepare("SELECT id FROM wishlist WHERE user_id = ? AND tmdb_id = ?").bind(r.user_id,n).first();return new Response(JSON.stringify({ok:!0,wishlisted:!!a}),{headers:s})}catch{return new Response(JSON.stringify({ok:!0,wishlisted:!1}),{headers:s})}if(d.match(/^\/reviews\/\d+$/)&&i.method==="GET")try{let n=parseInt(d.split("/")[2]),e=(i.headers.get("Authorization")||"").replace("Bearer ","").trim()||h(i),r=-1;if(e){let c=await t.DB.prepare("SELECT user_id FROM sessions WHERE id = ? AND expires_at > datetime('now')").bind(e).first();c&&(r=c.user_id)}let{results:a}=await t.DB.prepare(`
        SELECT r.*, u.nickname, u.provider, u.grade, u.mbti,
          gs.emoji_url as grade_emoji_url, gs.grade_name,
          CASE WHEN rl.id IS NOT NULL THEN 1 ELSE 0 END AS liked_by_me
        FROM reviews r
        JOIN users u ON r.user_id = u.id
        LEFT JOIN grade_settings gs ON gs.grade_key = u.grade
        LEFT JOIN review_likes rl ON rl.review_id = r.id AND rl.user_id = ? AND rl.is_active = 1
        WHERE r.tmdb_id = ?
        ORDER BY r.likes DESC, r.created_at DESC
      `).bind(r,n).all();return new Response(JSON.stringify({ok:!0,data:a}),{headers:s})}catch(n){return new Response(JSON.stringify({ok:!1,message:n.message}),{status:500,headers:s})}if(d.match(/^\/reviews\/\d+\/me$/)&&i.method==="GET")try{let n=parseInt(d.split("/")[2]),e=(i.headers.get("Authorization")||"").replace("Bearer ","").trim()||h(i);if(!e)return new Response(JSON.stringify({ok:!0,data:null}),{headers:s});let r=await t.DB.prepare("SELECT user_id FROM sessions WHERE id = ? AND expires_at > datetime('now')").bind(e).first();if(!r)return new Response(JSON.stringify({ok:!0,data:null}),{headers:s});let a=await t.DB.prepare("SELECT * FROM reviews WHERE tmdb_id = ? AND user_id = ?").bind(n,r.user_id).first();return new Response(JSON.stringify({ok:!0,data:a||null}),{headers:s})}catch(n){return new Response(JSON.stringify({ok:!1,message:n.message}),{status:500,headers:s})}if(d.match(/^\/reviews\/\d+$/)&&i.method==="POST")try{let n=parseInt(d.split("/")[2]),e=(i.headers.get("Authorization")||"").replace("Bearer ","").trim()||h(i);if(!e)return new Response(JSON.stringify({ok:!1,message:"\uB85C\uADF8\uC778 \uD544\uC694"}),{status:401,headers:s});let r=await t.DB.prepare("SELECT user_id FROM sessions WHERE id = ? AND expires_at > datetime('now')").bind(e).first();if(!r)return new Response(JSON.stringify({ok:!1,message:"\uC138\uC158 \uB9CC\uB8CC"}),{status:401,headers:s});let a=await i.json(),{score:c,emotions:p,custom_tags:m,text:_,spoiler:u}=a;if(!c||c<.5||c>10)return new Response(JSON.stringify({ok:!1,message:"\uBCC4\uC810\uC744 \uC120\uD0DD\uD574\uC8FC\uC138\uC694 (0.5~10)"}),{status:400,headers:s});let k=!await t.DB.prepare("SELECT id FROM reviews WHERE tmdb_id = ? AND user_id = ?").bind(n,r.user_id).first();return await t.DB.prepare(`
        INSERT INTO reviews (tmdb_id, user_id, score, emotions, custom_tags, text, spoiler)
        VALUES (?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(tmdb_id, user_id) DO UPDATE SET
          score       = excluded.score,
          emotions    = excluded.emotions,
          custom_tags = excluded.custom_tags,
          text        = excluded.text,
          spoiler     = excluded.spoiler,
          created_at  = datetime('now')
      `).bind(n,r.user_id,c,JSON.stringify(p||[]),JSON.stringify(m||[]),(_||"").slice(0,500),u?1:0).run(),k&&f.waitUntil(H(r.user_id,10,"review",t)),f.waitUntil(F(r.user_id,t)),new Response(JSON.stringify({ok:!0}),{headers:s})}catch(n){return new Response(JSON.stringify({ok:!1,message:n.message}),{status:500,headers:s})}if(d.match(/^\/reviews\/\d+\/like\/\d+$/)&&i.method==="POST")try{let n=parseInt(d.split("/")[4]),e=(i.headers.get("Authorization")||"").replace("Bearer ","").trim()||h(i);if(!e)return new Response(JSON.stringify({ok:!1,message:"\uB85C\uADF8\uC778 \uD544\uC694"}),{status:401,headers:s});let r=await t.DB.prepare("SELECT user_id FROM sessions WHERE id = ? AND expires_at > datetime('now')").bind(e).first();if(!r)return new Response(JSON.stringify({ok:!1,message:"\uC138\uC158 \uB9CC\uB8CC"}),{status:401,headers:s});let a=await t.DB.prepare("SELECT user_id FROM reviews WHERE id = ?").bind(n).first();if(!a)return new Response(JSON.stringify({ok:!1,message:"\uB9AC\uBDF0\uB97C \uCC3E\uC744 \uC218 \uC5C6\uC5B4\uC694"}),{status:404,headers:s});let c=await t.DB.prepare("SELECT id, is_active FROM review_likes WHERE review_id = ? AND user_id = ?").bind(n,r.user_id).first(),p;c?c.is_active?(await t.DB.prepare("UPDATE review_likes SET is_active = 0 WHERE id = ?").bind(c.id).run(),await t.DB.prepare("UPDATE reviews SET likes = MAX(0, likes - 1) WHERE id = ?").bind(n).run(),a.user_id&&await t.DB.prepare("UPDATE users SET total_likes_received = MAX(0, total_likes_received - 1) WHERE id = ?").bind(a.user_id).run(),p=!1):(await t.DB.prepare("UPDATE review_likes SET is_active = 1 WHERE id = ?").bind(c.id).run(),await t.DB.prepare("UPDATE reviews SET likes = likes + 1 WHERE id = ?").bind(n).run(),a.user_id&&await t.DB.prepare("UPDATE users SET total_likes_received = total_likes_received + 1 WHERE id = ?").bind(a.user_id).run(),p=!0):(await t.DB.prepare("INSERT INTO review_likes (review_id, user_id, is_active) VALUES (?, ?, 1)").bind(n,r.user_id).run(),await t.DB.prepare("UPDATE reviews SET likes = likes + 1 WHERE id = ?").bind(n).run(),a.user_id&&(await t.DB.prepare("UPDATE users SET total_likes_received = total_likes_received + 1 WHERE id = ?").bind(a.user_id).run(),f.waitUntil(H(a.user_id,1,"like_received",t)),f.waitUntil(F(a.user_id,t))),p=!0);let m=await t.DB.prepare("SELECT likes FROM reviews WHERE id = ?").bind(n).first();return new Response(JSON.stringify({ok:!0,liked:p,likes:m?.likes??0}),{headers:s})}catch(n){return new Response(JSON.stringify({ok:!1,message:n.message}),{status:500,headers:s})}if(d.match(/^\/reviews\/\d+$/)&&i.method==="DELETE")try{let n=parseInt(d.split("/")[2]),e=(i.headers.get("Authorization")||"").replace("Bearer ","").trim()||h(i);if(!e)return new Response(JSON.stringify({ok:!1,message:"\uB85C\uADF8\uC778 \uD544\uC694"}),{status:401,headers:s});let r=await t.DB.prepare("SELECT user_id FROM sessions WHERE id = ? AND expires_at > datetime('now')").bind(e).first();return r?(await t.DB.prepare("DELETE FROM reviews WHERE tmdb_id = ? AND user_id = ?").bind(n,r.user_id).run(),f.waitUntil(F(r.user_id,t)),new Response(JSON.stringify({ok:!0}),{headers:s})):new Response(JSON.stringify({ok:!1,message:"\uC138\uC158 \uB9CC\uB8CC"}),{status:401,headers:s})}catch(n){return new Response(JSON.stringify({ok:!1,message:n.message}),{status:500,headers:s})}if(d==="/mypage"&&i.method==="GET")try{let l=(i.headers.get("Authorization")||"").replace("Bearer ","").trim()||h(i);if(!l)return new Response(JSON.stringify({ok:!1,message:"\uB85C\uADF8\uC778 \uD544\uC694"}),{status:401,headers:s});let e=await t.DB.prepare("SELECT user_id FROM sessions WHERE id = ? AND expires_at > datetime('now')").bind(l).first();if(!e)return new Response(JSON.stringify({ok:!1,message:"\uC138\uC158 \uB9CC\uB8CC"}),{status:401,headers:s});let r=e.user_id,[a,c,p,m,_,u,g,k]=await t.DB.batch([t.DB.prepare(`
          SELECT u.id, u.nickname, u.provider, u.email, u.avatar_url,
            u.grade, u.total_likes_received, u.created_at, u.wishlist_public, u.mbti,
            u.ott_points,
            gs.grade_name, gs.emoji_url as grade_emoji_url, gs.sort_order as grade_order,
            gs.is_special as grade_is_special
          FROM users u
          LEFT JOIN grade_settings gs ON gs.grade_key = u.grade
          WHERE u.id = ?
        `).bind(r),t.DB.prepare(`
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
        `).bind(r,r),t.DB.prepare(`
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
        `).bind(r,r),t.DB.prepare(`
          SELECT id, board_type, title, like_count, view_count, created_at
          FROM posts
          WHERE user_id = ? AND is_hidden = 0
          ORDER BY created_at DESC
        `).bind(r),t.DB.prepare(`
          SELECT lw.*,
            COALESCE(wk.poster_path, lw.poster_path) as poster_path,
            COALESCE(wk.title_ko, lw.title_ko) as title_ko
          FROM life_works lw
          LEFT JOIN works wk ON wk.tmdb_id = lw.tmdb_id
          WHERE lw.user_id = ?
          ORDER BY lw.created_at DESC
        `).bind(r),t.DB.prepare("SELECT * FROM pick_lists WHERE user_id = ? ORDER BY created_at DESC").bind(r),t.DB.prepare(`
          SELECT points, reason, created_at
          FROM user_point_logs
          WHERE user_id = ?
          ORDER BY created_at DESC
          LIMIT 20
        `).bind(r),t.DB.prepare("SELECT grade_key, grade_name, min_ott_points, emoji_url, is_special, sort_order FROM grade_settings ORDER BY sort_order ASC")]),E=a.results[0]||null,w=c.results,y=p.results,b=m.results,N=_.results,R=u.results,D=g.results,S=k.results,T=[];if(R.length){let L=await t.DB.batch(R.map(C=>t.DB.prepare("SELECT * FROM pick_list_works WHERE pick_list_id = ? ORDER BY sort_order ASC, created_at DESC").bind(C.id)));T=R.map((C,I)=>{let B=L[I].results;return{...C,works:B,work_count:B.length}})}return new Response(JSON.stringify({ok:!0,is_own:!0,user:E,reviews:w,wishlist:y,posts:b,life_works:N,pick_lists:T,recent_point_logs:D,grade_settings:S,stats:{review_count:w.length,wishlist_count:y.length,likes_received:E?.total_likes_received||0,post_count:b.length,life_work_count:N.length,pick_list_count:T.length}}),{headers:s})}catch(n){return new Response(JSON.stringify({ok:!1,message:n.message}),{status:500,headers:s})}if(d==="/mypage/summary"&&i.method==="GET")try{let l=(i.headers.get("Authorization")||"").replace("Bearer ","").trim()||h(i);if(!l)return new Response(JSON.stringify({ok:!1,message:"\uB85C\uADF8\uC778 \uD544\uC694"}),{status:401,headers:s});let e=await t.DB.prepare("SELECT user_id FROM sessions WHERE id = ? AND expires_at > datetime('now')").bind(l).first();if(!e)return new Response(JSON.stringify({ok:!1,message:"\uC138\uC158 \uB9CC\uB8CC"}),{status:401,headers:s});let r=await t.DB.prepare(`
        SELECT u.id, u.nickname, u.grade, u.ott_points,
          gs.grade_name, gs.emoji_url as grade_emoji_url, gs.sort_order as grade_order,
          gs.is_special as grade_is_special
        FROM users u
        LEFT JOIN grade_settings gs ON gs.grade_key = u.grade
        WHERE u.id = ?
      `).bind(e.user_id).first();return new Response(JSON.stringify({ok:!0,user:r}),{headers:s})}catch(n){return new Response(JSON.stringify({ok:!1,message:n.message}),{status:500,headers:s})}if(d==="/mypage/point-logs"&&i.method==="GET")try{let l=(i.headers.get("Authorization")||"").replace("Bearer ","").trim()||h(i);if(!l)return new Response(JSON.stringify({ok:!1,message:"\uB85C\uADF8\uC778 \uD544\uC694"}),{status:401,headers:s});let e=await t.DB.prepare("SELECT user_id FROM sessions WHERE id = ? AND expires_at > datetime('now')").bind(l).first();if(!e)return new Response(JSON.stringify({ok:!1,message:"\uC138\uC158 \uB9CC\uB8CC"}),{status:401,headers:s});let r=new URL(i.url).searchParams,a=Math.max(1,parseInt(r.get("page")||"1")),c=Math.min(50,Math.max(1,parseInt(r.get("limit")||"10"))),p=(a-1)*c,[m,_]=await t.DB.batch([t.DB.prepare("SELECT COUNT(*) AS total FROM user_point_logs WHERE user_id = ?").bind(e.user_id),t.DB.prepare(`
          SELECT points, reason, created_at
          FROM user_point_logs
          WHERE user_id = ?
          ORDER BY created_at DESC
          LIMIT ? OFFSET ?
        `).bind(e.user_id,c,p)]),u=m.results[0]?.total||0,g=_.results;return new Response(JSON.stringify({ok:!0,logs:g,total:u,page:a,limit:c}),{headers:s})}catch(n){return new Response(JSON.stringify({ok:!1,message:n.message}),{status:500,headers:s})}if(d==="/mypage/wishlist-public"&&i.method==="PATCH")try{let l=(i.headers.get("Authorization")||"").replace("Bearer ","").trim()||h(i);if(!l)return new Response(JSON.stringify({ok:!1,message:"\uB85C\uADF8\uC778 \uD544\uC694"}),{status:401,headers:s});let e=await t.DB.prepare("SELECT user_id FROM sessions WHERE id = ? AND expires_at > datetime('now')").bind(l).first();if(!e)return new Response(JSON.stringify({ok:!1,message:"\uC138\uC158 \uB9CC\uB8CC"}),{status:401,headers:s});let a=(await i.json()).wishlist_public?1:0;return await t.DB.prepare("UPDATE users SET wishlist_public = ? WHERE id = ?").bind(a,e.user_id).run(),new Response(JSON.stringify({ok:!0,wishlist_public:a}),{headers:s})}catch(n){return new Response(JSON.stringify({ok:!1,message:n.message}),{status:500,headers:s})}if(d.match(/^\/user\/\d+$/)&&i.method==="GET")try{let n=parseInt(d.split("/")[2]),l=await t.DB.prepare(`
        SELECT u.id, u.nickname, u.grade, u.total_likes_received, u.created_at,
          u.wishlist_public, u.mbti,
          gs.grade_name, gs.emoji_url as grade_emoji_url, gs.is_special as grade_is_special
        FROM users u
        LEFT JOIN grade_settings gs ON gs.grade_key = u.grade
        WHERE u.id = ?
      `).bind(n).first();if(!l)return new Response(JSON.stringify({ok:!1,message:"\uC720\uC800\uB97C \uCC3E\uC744 \uC218 \uC5C6\uC5B4\uC694"}),{status:404,headers:s});let{results:e}=await t.DB.prepare(`
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
      `).bind(n,n).all(),r=[];if(l.wishlist_public){let{results:_}=await t.DB.prepare(`
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
        `).bind(n,n).all();r=_}let{results:a}=await t.DB.prepare(`
        SELECT id, board_type, title, like_count, view_count, created_at
        FROM posts WHERE user_id = ? AND is_hidden = 0 ORDER BY created_at DESC
      `).bind(n).all(),{results:c}=await t.DB.prepare(`
        SELECT lw.*,
          COALESCE(wk.poster_path, lw.poster_path) as poster_path,
          COALESCE(wk.title_ko, lw.title_ko) as title_ko
        FROM life_works lw
        LEFT JOIN works wk ON wk.tmdb_id = lw.tmdb_id
        WHERE lw.user_id = ?
        ORDER BY lw.created_at DESC
      `).bind(n).all(),{results:p}=await t.DB.prepare("SELECT * FROM pick_lists WHERE user_id = ? AND is_public = 1 ORDER BY created_at DESC").bind(n).all(),m=await Promise.all(p.map(async _=>{let{results:u}=await t.DB.prepare("SELECT * FROM pick_list_works WHERE pick_list_id = ? ORDER BY sort_order ASC, created_at DESC").bind(_.id).all();return{..._,works:u,work_count:u.length}}));return new Response(JSON.stringify({ok:!0,is_own:!1,user:l,reviews:e,wishlist:r,wishlist_hidden:!l.wishlist_public,posts:a,life_works:c,pick_lists:m,stats:{review_count:e.length,wishlist_count:l.wishlist_public?r.length:null,likes_received:l.total_likes_received||0,post_count:a.length,life_work_count:c.length,pick_list_count:m.length}}),{headers:s})}catch(n){return new Response(JSON.stringify({ok:!1,message:n.message}),{status:500,headers:s})}if(d==="/mypage/reviews"&&i.method==="GET")try{let l=(i.headers.get("Authorization")||"").replace("Bearer ","").trim()||h(i);if(!l)return new Response(JSON.stringify({ok:!1,message:"\uB85C\uADF8\uC778 \uD544\uC694"}),{status:401,headers:s});let e=await t.DB.prepare("SELECT user_id FROM sessions WHERE id = ? AND expires_at > datetime('now')").bind(l).first();if(!e)return new Response(JSON.stringify({ok:!1,message:"\uC138\uC158 \uB9CC\uB8CC"}),{status:401,headers:s});let r=await t.DB.prepare("SELECT nickname FROM users WHERE id = ?").bind(e.user_id).first(),{results:a}=await t.DB.prepare(`
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
      `).bind(e.user_id,e.user_id).all();return new Response(JSON.stringify({ok:!0,reviews:a,nickname:r?.nickname||"\uB098"}),{headers:s})}catch(n){return new Response(JSON.stringify({ok:!1,message:n.message}),{status:500,headers:s})}if(d.match(/^\/user\/\d+\/reviews$/)&&i.method==="GET")try{let n=parseInt(d.split("/")[2]),l=await t.DB.prepare("SELECT nickname FROM users WHERE id = ?").bind(n).first();if(!l)return new Response(JSON.stringify({ok:!1,message:"\uC720\uC800\uB97C \uCC3E\uC744 \uC218 \uC5C6\uC5B4\uC694"}),{status:404,headers:s});let r=(i.headers.get("Authorization")||"").replace("Bearer ","").trim()||h(i),a=-1;if(r){let p=await t.DB.prepare("SELECT user_id FROM sessions WHERE id = ? AND expires_at > datetime('now')").bind(r).first();p&&(a=p.user_id)}let{results:c}=await t.DB.prepare(`
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
      `).bind(n,a,n).all();return new Response(JSON.stringify({ok:!0,reviews:c,nickname:l.nickname||"\uC720\uC800"}),{headers:s})}catch(n){return new Response(JSON.stringify({ok:!1,message:n.message}),{status:500,headers:s})}if(d==="/life-works"&&i.method==="POST")try{let l=(i.headers.get("Authorization")||"").replace("Bearer ","").trim()||h(i);if(!l)return new Response(JSON.stringify({ok:!1,message:"\uB85C\uADF8\uC778 \uD544\uC694"}),{status:401,headers:s});let e=await t.DB.prepare("SELECT user_id FROM sessions WHERE id = ? AND expires_at > datetime('now')").bind(l).first();if(!e)return new Response(JSON.stringify({ok:!1,message:"\uC138\uC158 \uB9CC\uB8CC"}),{status:401,headers:s});let{tmdb_id:r,title_ko:a,poster_path:c,media_type:p}=await i.json();return r?await t.DB.prepare("SELECT id FROM life_works WHERE user_id = ? AND tmdb_id = ?").bind(e.user_id,parseInt(r)).first()?(await t.DB.prepare("DELETE FROM life_works WHERE user_id = ? AND tmdb_id = ?").bind(e.user_id,parseInt(r)).run(),new Response(JSON.stringify({ok:!0,saved:!1}),{headers:s})):(await t.DB.prepare("INSERT INTO life_works (user_id, tmdb_id, title_ko, poster_path, media_type) VALUES (?, ?, ?, ?, ?)").bind(e.user_id,parseInt(r),a||"",c||"",p||"tv").run(),f.waitUntil(H(e.user_id,2,"life_work",t)),new Response(JSON.stringify({ok:!0,saved:!0}),{headers:s})):new Response(JSON.stringify({ok:!1,message:"tmdb_id \uD544\uC694"}),{status:400,headers:s})}catch(n){return new Response(JSON.stringify({ok:!1,message:n.message}),{status:500,headers:s})}if(d.match(/^\/life-works\/check\/\d+$/)&&i.method==="GET")try{let n=parseInt(d.split("/")[3]),e=(i.headers.get("Authorization")||"").replace("Bearer ","").trim()||h(i);if(!e)return new Response(JSON.stringify({ok:!0,saved:!1}),{headers:s});let r=await t.DB.prepare("SELECT user_id FROM sessions WHERE id = ? AND expires_at > datetime('now')").bind(e).first();if(!r)return new Response(JSON.stringify({ok:!0,saved:!1}),{headers:s});let a=await t.DB.prepare("SELECT id FROM life_works WHERE user_id = ? AND tmdb_id = ?").bind(r.user_id,n).first();return new Response(JSON.stringify({ok:!0,saved:!!a}),{headers:s})}catch{return new Response(JSON.stringify({ok:!0,saved:!1}),{headers:s})}if(d==="/pick-lists"&&i.method==="GET")try{let l=(i.headers.get("Authorization")||"").replace("Bearer ","").trim()||h(i);if(!l)return new Response(JSON.stringify({ok:!1,message:"\uB85C\uADF8\uC778 \uD544\uC694"}),{status:401,headers:s});let e=await t.DB.prepare("SELECT user_id FROM sessions WHERE id = ? AND expires_at > datetime('now')").bind(l).first();if(!e)return new Response(JSON.stringify({ok:!1,message:"\uC138\uC158 \uB9CC\uB8CC"}),{status:401,headers:s});let{results:r}=await t.DB.prepare("SELECT * FROM pick_lists WHERE user_id = ? ORDER BY created_at DESC").bind(e.user_id).all(),a=await Promise.all(r.map(async c=>{let{results:p}=await t.DB.prepare("SELECT * FROM pick_list_works WHERE pick_list_id = ? ORDER BY sort_order ASC, created_at DESC").bind(c.id).all();return{...c,works:p,work_count:p.length}}));return new Response(JSON.stringify({ok:!0,data:a}),{headers:s})}catch(n){return new Response(JSON.stringify({ok:!1,message:n.message}),{status:500,headers:s})}if(d==="/pick-lists"&&i.method==="POST")try{let l=(i.headers.get("Authorization")||"").replace("Bearer ","").trim()||h(i);if(!l)return new Response(JSON.stringify({ok:!1,message:"\uB85C\uADF8\uC778 \uD544\uC694"}),{status:401,headers:s});let e=await t.DB.prepare("SELECT user_id FROM sessions WHERE id = ? AND expires_at > datetime('now')").bind(l).first();if(!e)return new Response(JSON.stringify({ok:!1,message:"\uC138\uC158 \uB9CC\uB8CC"}),{status:401,headers:s});let{title:r,description:a,is_public:c}=await i.json();if(!r||!r.trim())return new Response(JSON.stringify({ok:!1,message:"\uCEEC\uB809\uC158 \uC81C\uBAA9\uC744 \uC785\uB825\uD574\uC8FC\uC138\uC694"}),{status:400,headers:s});let p=await t.DB.prepare("INSERT INTO pick_lists (user_id, title, description, is_public) VALUES (?, ?, ?, ?)").bind(e.user_id,r.trim().slice(0,50),(a||"").slice(0,200),c!==!1?1:0).run(),m=await t.DB.prepare("SELECT id FROM pick_lists WHERE user_id = ? ORDER BY id DESC LIMIT 1").bind(e.user_id).first();return f.waitUntil(H(e.user_id,2,"pick_list",t)),new Response(JSON.stringify({ok:!0,id:m?.id||null}),{headers:s})}catch(n){return new Response(JSON.stringify({ok:!1,message:n.message}),{status:500,headers:s})}if(d.match(/^\/pick-lists\/\d+$/)&&i.method==="DELETE")try{let n=parseInt(d.split("/")[2]),e=(i.headers.get("Authorization")||"").replace("Bearer ","").trim()||h(i);if(!e)return new Response(JSON.stringify({ok:!1,message:"\uB85C\uADF8\uC778 \uD544\uC694"}),{status:401,headers:s});let r=await t.DB.prepare("SELECT user_id FROM sessions WHERE id = ? AND expires_at > datetime('now')").bind(e).first();return r?await t.DB.prepare("SELECT id FROM pick_lists WHERE id = ? AND user_id = ?").bind(n,r.user_id).first()?(await t.DB.prepare("DELETE FROM pick_lists WHERE id = ?").bind(n).run(),new Response(JSON.stringify({ok:!0}),{headers:s})):new Response(JSON.stringify({ok:!1,message:"\uCEEC\uB809\uC158\uC744 \uCC3E\uC744 \uC218 \uC5C6\uC5B4\uC694"}),{status:404,headers:s}):new Response(JSON.stringify({ok:!1,message:"\uC138\uC158 \uB9CC\uB8CC"}),{status:401,headers:s})}catch(n){return new Response(JSON.stringify({ok:!1,message:n.message}),{status:500,headers:s})}if(d.match(/^\/pick-lists\/\d+\/works$/)&&i.method==="POST")try{let n=parseInt(d.split("/")[2]),e=(i.headers.get("Authorization")||"").replace("Bearer ","").trim()||h(i);if(!e)return new Response(JSON.stringify({ok:!1,message:"\uB85C\uADF8\uC778 \uD544\uC694"}),{status:401,headers:s});let r=await t.DB.prepare("SELECT user_id FROM sessions WHERE id = ? AND expires_at > datetime('now')").bind(e).first();if(!r)return new Response(JSON.stringify({ok:!1,message:"\uC138\uC158 \uB9CC\uB8CC"}),{status:401,headers:s});if(!await t.DB.prepare("SELECT id FROM pick_lists WHERE id = ? AND user_id = ?").bind(n,r.user_id).first())return new Response(JSON.stringify({ok:!1,message:"\uCEEC\uB809\uC158\uC744 \uCC3E\uC744 \uC218 \uC5C6\uC5B4\uC694"}),{status:404,headers:s});let{tmdb_id:c,title_ko:p,poster_path:m,media_type:_}=await i.json();return c?await t.DB.prepare("SELECT id FROM pick_list_works WHERE pick_list_id = ? AND tmdb_id = ?").bind(n,parseInt(c)).first()?(await t.DB.prepare("DELETE FROM pick_list_works WHERE pick_list_id = ? AND tmdb_id = ?").bind(n,parseInt(c)).run(),new Response(JSON.stringify({ok:!0,added:!1}),{headers:s})):(await t.DB.prepare("INSERT INTO pick_list_works (pick_list_id, tmdb_id, title_ko, poster_path, media_type) VALUES (?, ?, ?, ?, ?)").bind(n,parseInt(c),p||"",m||"",_||"tv").run(),new Response(JSON.stringify({ok:!0,added:!0}),{headers:s})):new Response(JSON.stringify({ok:!1,message:"tmdb_id \uD544\uC694"}),{status:400,headers:s})}catch(n){return new Response(JSON.stringify({ok:!1,message:n.message}),{status:500,headers:s})}if(d.match(/^\/pick-lists\/check\/\d+$/)&&i.method==="GET")try{let n=parseInt(d.split("/")[3]),e=(i.headers.get("Authorization")||"").replace("Bearer ","").trim()||h(i);if(!e)return new Response(JSON.stringify({ok:!0,lists:[]}),{headers:s});let r=await t.DB.prepare("SELECT user_id FROM sessions WHERE id = ? AND expires_at > datetime('now')").bind(e).first();if(!r)return new Response(JSON.stringify({ok:!0,lists:[]}),{headers:s});let{results:a}=await t.DB.prepare("SELECT * FROM pick_lists WHERE user_id = ? ORDER BY created_at DESC").bind(r.user_id).all(),c=await Promise.all(a.map(async p=>{let m=await t.DB.prepare("SELECT id FROM pick_list_works WHERE pick_list_id = ? AND tmdb_id = ?").bind(p.id,n).first(),{results:_}=await t.DB.prepare("SELECT COUNT(*) as cnt FROM pick_list_works WHERE pick_list_id = ?").bind(p.id).all();return{...p,has_work:!!m,work_count:_[0]?.cnt||0}}));return new Response(JSON.stringify({ok:!0,lists:c}),{headers:s})}catch{return new Response(JSON.stringify({ok:!0,lists:[]}),{headers:s})}if(d==="/reviews/recent"&&i.method==="GET")try{let n=new URL(i.url).searchParams,l=Math.min(parseInt(n.get("limit")||"5"),20),e=Math.max(1,parseInt(n.get("page")||"1")),r=(e-1)*l,c=(i.headers.get("Authorization")||"").replace("Bearer ","").trim()||h(i),p=-1;if(c){let g=await t.DB.prepare("SELECT user_id FROM sessions WHERE id = ? AND expires_at > datetime('now')").bind(c).first();g&&(p=g.user_id)}let _=(await t.DB.prepare("SELECT COUNT(*) AS total FROM reviews").first())?.total||0,{results:u}=await t.DB.prepare(`
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
      `).bind(p,l,r).all();return new Response(JSON.stringify({ok:!0,reviews:u||[],total:_,page:e,limit:l}),{headers:s})}catch(n){return new Response(JSON.stringify({ok:!1,message:n.message}),{status:500,headers:s})}if(d==="/grade-settings"&&i.method==="GET")try{let{results:n}=await t.DB.prepare("SELECT * FROM grade_settings ORDER BY sort_order ASC").all();return new Response(JSON.stringify({ok:!0,data:n}),{headers:s})}catch(n){return new Response(JSON.stringify({ok:!1,message:n.message}),{status:500,headers:s})}if(d==="/reviews/share"&&i.method==="POST")try{let l=(i.headers.get("Authorization")||"").replace("Bearer ","").trim()||h(i);if(!l)return new Response(JSON.stringify({ok:!1,message:"\uB85C\uADF8\uC778 \uD544\uC694"}),{status:401,headers:s});let e=await t.DB.prepare("SELECT user_id FROM sessions WHERE id = ? AND expires_at > datetime('now')").bind(l).first();if(!e)return new Response(JSON.stringify({ok:!1,message:"\uC138\uC158 \uB9CC\uB8CC"}),{status:401,headers:s});let r=new Date(Date.now()+540*60*1e3).toISOString().slice(0,10);return await t.DB.prepare(`SELECT id FROM user_point_logs
         WHERE user_id = ? AND reason = 'share'
         AND DATE(created_at) = ?
         LIMIT 1`).bind(e.user_id,r).first()?new Response(JSON.stringify({ok:!0,already:!0,message:"\uC624\uB298\uC740 \uC774\uBBF8 \uACF5\uC720 \uC624\uB728\uB97C \uBC1B\uC558\uC5B4\uC694"}),{headers:s}):(await H(e.user_id,10,"share",t),new Response(JSON.stringify({ok:!0,already:!1,points:10}),{headers:s}))}catch(n){return new Response(JSON.stringify({ok:!1,message:n.message}),{status:500,headers:s})}if(d==="/admin/reviews"&&i.method==="GET"){if(i.headers.get("Authorization")!==`Bearer ${t.ADMIN_SECRET}`)return new Response(JSON.stringify({ok:!1,message:"Unauthorized"}),{status:401,headers:s});try{let n=new URL(i.url),l=(n.searchParams.get("q")||"").trim(),e=Math.max(1,parseInt(n.searchParams.get("page")||"1")),r=Math.min(parseInt(n.searchParams.get("limit")||"20"),50),a=(e-1)*r,c=l?"WHERE u.nickname LIKE ? OR w.title_ko LIKE ?":"",p=l?[`%${l}%`,`%${l}%`]:[],[m,_]=await t.DB.batch([t.DB.prepare(`
          SELECT r.id, r.tmdb_id, r.score, r.text, r.emotions, r.likes, r.created_at,
                 u.nickname, w.title_ko, w.poster_path
          FROM reviews r
          JOIN users u ON r.user_id = u.id
          LEFT JOIN works w ON r.tmdb_id = w.tmdb_id
          ${c}
          ORDER BY r.created_at DESC
          LIMIT ? OFFSET ?
        `).bind(...p,r,a),t.DB.prepare(`
          SELECT COUNT(*) as cnt
          FROM reviews r
          JOIN users u ON r.user_id = u.id
          LEFT JOIN works w ON r.tmdb_id = w.tmdb_id
          ${c}
        `).bind(...p)]),u=m.results||[],g=_.results?.[0]?.cnt||0;return new Response(JSON.stringify({ok:!0,data:u,total:g,page:e,limit:r}),{headers:s})}catch(n){return new Response(JSON.stringify({ok:!1,message:n.message}),{status:500,headers:s})}}let o=d.match(/^\/admin\/reviews\/(\d+)$/);if(i.method==="DELETE"&&o){if(i.headers.get("Authorization")!==`Bearer ${t.ADMIN_SECRET}`)return new Response(JSON.stringify({ok:!1,message:"Unauthorized"}),{status:401,headers:s});try{let n=o[1],l=await t.DB.prepare("SELECT id, user_id FROM reviews WHERE id = ?").bind(n).first();return l?(await t.DB.prepare("DELETE FROM reviews WHERE id = ?").bind(n).run(),l.user_id&&f.waitUntil(F(l.user_id,t)),new Response(JSON.stringify({ok:!0}),{headers:s})):new Response(JSON.stringify({ok:!1,message:"\uCC3E\uC744 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4"}),{status:404,headers:s})}catch(n){return new Response(JSON.stringify({ok:!1,message:n.message}),{status:500,headers:s})}}return null}async function st(d,i,t,f,s,o){if(d==="/posts"&&i.method==="GET")try{let n=s.searchParams.get("board")||"free",l=parseInt(s.searchParams.get("page")||"1"),e=20,r=(l-1)*e,{results:a}=await t.DB.prepare(`
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
      `).bind(n,e,r).all(),c=await t.DB.prepare("SELECT COUNT(*) as cnt FROM posts WHERE board_type = ? AND is_hidden = 0").bind(n).first();return new Response(JSON.stringify({ok:!0,data:a,total:c?.cnt||0,page:l,limit:e}),{headers:o})}catch(n){return new Response(JSON.stringify({ok:!1,message:n.message}),{status:500,headers:o})}if(d.match(/^\/posts\/\d+$/)&&i.method==="GET")try{let n=parseInt(d.split("/")[2]);await t.DB.prepare("UPDATE posts SET view_count = view_count + 1 WHERE id = ?").bind(n).run();let l=await t.DB.prepare(`
        SELECT p.*, u.nickname, u.grade,
          gs.emoji_url as grade_emoji_url, gs.grade_name
        FROM posts p
        JOIN users u ON p.user_id = u.id
        LEFT JOIN grade_settings gs ON gs.grade_key = u.grade
        WHERE p.id = ? AND p.is_hidden = 0
      `).bind(n).first();return l?new Response(JSON.stringify({ok:!0,data:l}),{headers:o}):new Response(JSON.stringify({ok:!1,message:"Not found"}),{status:404,headers:o})}catch(n){return new Response(JSON.stringify({ok:!1,message:n.message}),{status:500,headers:o})}if(d==="/posts"&&i.method==="POST")try{let l=(i.headers.get("Authorization")||"").replace("Bearer ","").trim()||h(i);if(!l)return new Response(JSON.stringify({ok:!1,message:"\uB85C\uADF8\uC778 \uD544\uC694"}),{status:401,headers:o});let e=await t.DB.prepare("SELECT user_id FROM sessions WHERE id = ? AND expires_at > datetime('now')").bind(l).first();if(!e)return new Response(JSON.stringify({ok:!1,message:"\uC138\uC158 \uB9CC\uB8CC"}),{status:401,headers:o});let r=await i.json(),{board_type:a,title:c,content:p}=r;if(!["recommend","free","community"].includes(a))return new Response(JSON.stringify({ok:!1,message:"\uC62C\uBC14\uB978 \uAC8C\uC2DC\uD310\uC744 \uC120\uD0DD\uD574\uC8FC\uC138\uC694"}),{status:400,headers:o});if(!c||c.trim().length<2)return new Response(JSON.stringify({ok:!1,message:"\uC81C\uBAA9\uC740 2\uC790 \uC774\uC0C1 \uC785\uB825\uD574\uC8FC\uC138\uC694"}),{status:400,headers:o});if(c.trim().length>100)return new Response(JSON.stringify({ok:!1,message:"\uC81C\uBAA9\uC740 100\uC790 \uC774\uB0B4\uB85C \uC785\uB825\uD574\uC8FC\uC138\uC694"}),{status:400,headers:o});if(!p||p.trim().length<5)return new Response(JSON.stringify({ok:!1,message:"\uB0B4\uC6A9\uC740 5\uC790 \uC774\uC0C1 \uC785\uB825\uD574\uC8FC\uC138\uC694"}),{status:400,headers:o});let m=await t.DB.prepare("INSERT INTO posts (board_type, user_id, title, content) VALUES (?, ?, ?, ?)").bind(a,e.user_id,c.trim(),p.trim()).run();return f.waitUntil(F(e.user_id,t)),new Response(JSON.stringify({ok:!0,id:m.meta?.last_row_id}),{headers:o})}catch(n){return new Response(JSON.stringify({ok:!1,message:n.message}),{status:500,headers:o})}if(d.match(/^\/posts\/\d+$/)&&i.method==="PATCH")try{let n=parseInt(d.split("/")[2]),e=(i.headers.get("Authorization")||"").replace("Bearer ","").trim()||h(i);if(!e)return new Response(JSON.stringify({ok:!1,message:"\uB85C\uADF8\uC778 \uD544\uC694"}),{status:401,headers:o});let r=await t.DB.prepare("SELECT user_id FROM sessions WHERE id = ? AND expires_at > datetime('now')").bind(e).first();if(!r)return new Response(JSON.stringify({ok:!1,message:"\uC138\uC158 \uB9CC\uB8CC"}),{status:401,headers:o});let a=await t.DB.prepare("SELECT user_id FROM posts WHERE id = ?").bind(n).first();if(!a)return new Response(JSON.stringify({ok:!1,message:"\uAC8C\uC2DC\uAE00 \uC5C6\uC74C"}),{status:404,headers:o});if(a.user_id!==r.user_id)return new Response(JSON.stringify({ok:!1,message:"\uAD8C\uD55C \uC5C6\uC74C"}),{status:403,headers:o});let c=await i.json(),{title:p,content:m}=c;return await t.DB.prepare("UPDATE posts SET title = ?, content = ?, updated_at = datetime('now') WHERE id = ?").bind(p.trim(),m.trim(),n).run(),new Response(JSON.stringify({ok:!0}),{headers:o})}catch(n){return new Response(JSON.stringify({ok:!1,message:n.message}),{status:500,headers:o})}if(d.match(/^\/posts\/\d+$/)&&i.method==="DELETE")try{let n=parseInt(d.split("/")[2]),e=(i.headers.get("Authorization")||"").replace("Bearer ","").trim()||h(i);if(!e)return new Response(JSON.stringify({ok:!1,message:"\uB85C\uADF8\uC778 \uD544\uC694"}),{status:401,headers:o});let r=await t.DB.prepare("SELECT user_id FROM sessions WHERE id = ? AND expires_at > datetime('now')").bind(e).first();if(!r)return new Response(JSON.stringify({ok:!1,message:"\uC138\uC158 \uB9CC\uB8CC"}),{status:401,headers:o});let a=await t.DB.prepare("SELECT user_id FROM posts WHERE id = ?").bind(n).first();return a?a.user_id!==r.user_id?new Response(JSON.stringify({ok:!1,message:"\uAD8C\uD55C \uC5C6\uC74C"}),{status:403,headers:o}):(await t.DB.prepare("DELETE FROM posts WHERE id = ?").bind(n).run(),f.waitUntil(F(r.user_id,t)),new Response(JSON.stringify({ok:!0}),{headers:o})):new Response(JSON.stringify({ok:!1,message:"\uAC8C\uC2DC\uAE00 \uC5C6\uC74C"}),{status:404,headers:o})}catch(n){return new Response(JSON.stringify({ok:!1,message:n.message}),{status:500,headers:o})}if(d.match(/^\/posts\/\d+\/like$/)&&i.method==="POST")try{let n=parseInt(d.split("/")[2]),l=await t.DB.prepare("SELECT user_id FROM posts WHERE id = ?").bind(n).first();return await t.DB.prepare("UPDATE posts SET like_count = like_count + 1 WHERE id = ?").bind(n).run(),l?.user_id&&(await t.DB.prepare("UPDATE users SET total_likes_received = total_likes_received + 1 WHERE id = ?").bind(l.user_id).run(),f.waitUntil(F(l.user_id,t))),new Response(JSON.stringify({ok:!0}),{headers:o})}catch(n){return new Response(JSON.stringify({ok:!1,message:n.message}),{status:500,headers:o})}return null}async function Y(d,i,t,f,s){let o=d.match(/^\/work-ott\/(\d+)$/);if(o&&i.method==="GET"){let e=parseInt(o[1]);try{let{results:r}=await t.DB.prepare(`SELECT id, tmdb_id, ott_key, action, created_at
         FROM work_ott_overrides
         WHERE tmdb_id = ?
         ORDER BY created_at DESC`).bind(e).all();return new Response(JSON.stringify({ok:!0,data:r||[]}),{headers:s})}catch(r){return new Response(JSON.stringify({ok:!1,error:r.message}),{status:500,headers:s})}}if(d==="/work-ott"&&i.method==="POST"){if(!O(i,t))return new Response(JSON.stringify({ok:!1,error:"Unauthorized"}),{status:401,headers:s});try{let e=await i.json(),{tmdb_id:r,ott_key:a,action:c}=e;return!r||!a||!c?new Response(JSON.stringify({ok:!1,error:"tmdb_id, ott_key, action \uD544\uC218"}),{status:400,headers:s}):["add","remove"].includes(c)?(await t.DB.prepare(`INSERT INTO work_ott_overrides (tmdb_id, ott_key, action)
         VALUES (?, ?, ?)
         ON CONFLICT(tmdb_id, ott_key)
         DO UPDATE SET action = excluded.action,
                       created_at = datetime('now')`).bind(r,a,c).run(),new Response(JSON.stringify({ok:!0}),{headers:s})):new Response(JSON.stringify({ok:!1,error:"action\uC740 'add' \uB610\uB294 'remove'\uB9CC \uD5C8\uC6A9"}),{status:400,headers:s})}catch(e){return new Response(JSON.stringify({ok:!1,error:e.message}),{status:500,headers:s})}}let n=d.match(/^\/work-ott\/(\d+)$/);if(n&&i.method==="DELETE"){if(!O(i,t))return new Response(JSON.stringify({ok:!1,error:"Unauthorized"}),{status:401,headers:s});let e=parseInt(n[1]);try{return await t.DB.prepare("DELETE FROM work_ott_overrides WHERE id = ?").bind(e).run(),new Response(JSON.stringify({ok:!0}),{headers:s})}catch(r){return new Response(JSON.stringify({ok:!1,error:r.message}),{status:500,headers:s})}}if(d==="/admin/title-map"&&i.method==="GET"){if(!O(i,t))return new Response(JSON.stringify({ok:!1,message:"Unauthorized"}),{status:401,headers:s});try{let e=parseInt(f.searchParams.get("page")||"1"),r=50,a=(e-1)*r,{results:c}=await t.DB.prepare("SELECT * FROM title_map ORDER BY created_at DESC LIMIT ? OFFSET ?").bind(r,a).all();return new Response(JSON.stringify({ok:!0,data:c}),{headers:s})}catch(e){return new Response(JSON.stringify({ok:!1,message:e.message}),{status:500,headers:s})}}if(d==="/admin/rankings"&&i.method==="POST"){if(!O(i,t))return new Response(JSON.stringify({ok:!1,message:"Unauthorized"}),{status:401,headers:s});try{let e=await i.json(),{platform:r,category_slot:a,date:c,tmdb_id:p,rank:m,title_ko:_,title_en:u,media_type:g,is_manual:k}=e;if(!r||!a||!c||!p||!_)return new Response(JSON.stringify({ok:!1,message:"platform, category_slot, date, tmdb_id, title_ko \uD544\uC218"}),{status:400,headers:s});let E=null,w=_||null,y=u||null,b=null,N=null,R=null,D=g==="tv"||g==="movie"?g:null;try{let T=D?[D]:["tv","movie"];for(let L of T){let C=await fetch(`https://api.themoviedb.org/3/${L}/${p}?language=ko-KR&api_key=${t.TMDB_API_KEY}`);if(!C.ok)continue;let I=await C.json();if(!(!I.poster_path&&!I.name&&!I.title)){if(E=I.poster_path||null,b=parseInt((I.first_air_date||I.release_date||"").slice(0,4))||null,R=I.vote_average?parseFloat(I.vote_average.toFixed(1)):null,N=(I.genres||[]).map(B=>B.name).join(", ")||null,D||(D=L),w||(w=I.name||I.title||null),!y){let B=await fetch(`https://api.themoviedb.org/3/${L}/${p}?language=en-US&api_key=${t.TMDB_API_KEY}`);if(B.ok){let J=await B.json(),M=J.original_title||J.original_name||"",W=J.title||J.name||"";y=/[\uAC00-\uD7A3]/.test(M)?W:M||W}}break}}}catch{}await t.DB.prepare(`
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
      `).bind(parseInt(p),w||"",y||"",E,D,w||null,y||null,E,D).run();let S=parseInt(m)||null;return S||(S=((await t.DB.prepare("SELECT MAX(rank) as max_rank FROM rankings WHERE platform = ? AND category_slot = ? AND date = ?").bind(r,a,c).first())?.max_rank||0)+1),await t.DB.prepare(`
        INSERT INTO rankings
          (platform, category_slot, category, date, rank, tmdb_id,
           title_ko, title_en, poster_path, release_year, genre, tmdb_rating,
           is_manual, source_name)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).bind(r,a,a,c,-S,parseInt(p),w||"",y||"",E,b,N,R,k?1:0,a).run(),await t.DB.prepare("UPDATE rankings SET rank = ? WHERE platform = ? AND category_slot = ? AND date = ? AND rank = ?").bind(S,r,a,c,-S).run(),y&&w&&await t.DB.prepare(`
          INSERT INTO title_map (title_en, title_ko, tmdb_id)
          VALUES (?, ?, ?)
          ON CONFLICT(title_en) DO UPDATE SET
            title_ko = excluded.title_ko,
            tmdb_id  = COALESCE(excluded.tmdb_id, tmdb_id)
        `).bind(y.trim(),w.trim(),parseInt(p)).run(),await t.DB.prepare("INSERT INTO admin_logs (action, platform, category_slot, target_id, after_value) VALUES ('ranking_add', ?, ?, ?, ?)").bind(r,a,String(p),JSON.stringify({rank:S,title_ko:w,date:c})).run(),new Response(JSON.stringify({ok:!0,rank:S,poster_path:E,title_ko:w,title_en:y}),{headers:s})}catch(e){return new Response(JSON.stringify({ok:!1,message:e.message}),{status:500,headers:s})}}if(d==="/admin/rankings"&&i.method==="GET"){if(!O(i,t))return new Response(JSON.stringify({ok:!1,message:"Unauthorized"}),{status:401,headers:s});let e=f.searchParams.get("date"),r=f.searchParams.get("manual"),a,c;r==="true"?(a="SELECT * FROM rankings WHERE date = 'manual' ORDER BY platform, category_slot, rank",c=null):e?(a="SELECT * FROM rankings WHERE date = ? ORDER BY platform, category_slot, rank",c=e):(a="SELECT * FROM rankings WHERE date = (SELECT MAX(date) FROM rankings WHERE date != 'manual') ORDER BY platform, category_slot, rank",c=null);let{results:p}=c?await t.DB.prepare(a).bind(c).all():await t.DB.prepare(a).all();return new Response(JSON.stringify({ok:!0,data:p}),{headers:s})}if(d==="/admin/fix"&&i.method==="POST"){if(!O(i,t))return new Response(JSON.stringify({ok:!1,message:"Unauthorized"}),{status:401,headers:s});try{let e=await i.json(),{id:r,tmdb_id:a,title_ko:c,title_en:p,delete_duplicates:m,media_type:_}=e,u=e.season!==void 0?e.season:void 0,g=e.poster_path||null;if(!r)return new Response(JSON.stringify({ok:!1,message:"id required"}),{status:400,headers:s});let k=null,E=c||null,w=p||null,y=await t.DB.prepare("SELECT title_ko, title_en, poster_path FROM rankings WHERE id = ?").bind(parseInt(r)).first();if(a)try{let D=_==="movie"?["movie"]:_==="tv"?["tv"]:["tv","movie"];for(let S of D){let T=await fetch(`https://api.themoviedb.org/3/${S}/${a}?language=ko-KR&api_key=${t.TMDB_API_KEY}`);if(!T.ok)continue;let L=await T.json();if(!(!L.poster_path&&!L.name&&!L.title)){if(k=L.poster_path||null,E||(E=L.name||L.title||null),!w){let C=await fetch(`https://api.themoviedb.org/3/${S}/${a}?language=en-US&api_key=${t.TMDB_API_KEY}`);if(C.ok){let I=await C.json(),B=I.original_title||I.original_name||"",J=I.title||I.name||"";w=/[\uAC00-\uD7A3]/.test(B)?J:B||J}}break}}}catch{}g&&(k=g);let b=u!==void 0?u!==null?parseInt(u):null:void 0;if(await t.DB.prepare(`
        UPDATE rankings
        SET tmdb_id     = COALESCE(?, tmdb_id),
            title_ko    = COALESCE(?, title_ko),
            title_en    = COALESCE(?, title_en),
            poster_path = COALESCE(?, poster_path),
            season      = ${b!==void 0?"?":"season"},
            is_manual   = 1
        WHERE id = ?
      `).bind(a?parseInt(a):null,E,w,k,...b!==void 0?[b]:[],parseInt(r)).run(),a){m&&(w&&await t.DB.prepare("DELETE FROM works WHERE title_en = ? AND tmdb_id != ?").bind(w,parseInt(a)).run(),E&&/[\uAC00-\uD7A3]/.test(E)&&await t.DB.prepare("DELETE FROM works WHERE title_ko = ? AND tmdb_id != ?").bind(E,parseInt(a)).run(),await t.DB.prepare("INSERT INTO admin_logs (action, target_id, memo) VALUES ('works_delete', ?, ?)").bind(String(a),`\uC911\uBCF5 \uC0AD\uC81C: title_en="${w}" title_ko="${E}"`).run());let D=_==="tv"||_==="movie"?_:null,S=g?null:k;await t.DB.prepare(`
          INSERT INTO works (tmdb_id, title_ko, title_en, poster_path, media_type)
          VALUES (?, ?, ?, ?, ?)
          ON CONFLICT(tmdb_id) DO UPDATE SET
            title_ko    = COALESCE(?, title_ko),
            title_en    = COALESCE(NULLIF(?, ''), title_en),
            poster_path = COALESCE(?, poster_path),
            media_type  = COALESCE(?, media_type),
            updated_at  = datetime('now')
        `).bind(parseInt(a),E||"",w||"",S,D,E||null,w||null,S,D).run()}let N=w||E||"",R=E||w||"";return N&&R&&a&&await t.DB.prepare(`
          INSERT INTO title_map (title_en, title_ko, tmdb_id)
          VALUES (?, ?, ?)
          ON CONFLICT(title_en) DO UPDATE SET
            title_ko = excluded.title_ko,
            tmdb_id  = COALESCE(excluded.tmdb_id, tmdb_id)
        `).bind(N.trim(),R.trim(),parseInt(a)).run(),new Response(JSON.stringify({ok:!0,poster_path:k,title_ko:E,title_en:w}),{headers:s})}catch(e){return new Response(JSON.stringify({ok:!1,message:e.message}),{status:500,headers:s})}}if(d==="/admin/unfix"&&i.method==="POST"){if(!O(i,t))return new Response(JSON.stringify({ok:!1,message:"Unauthorized"}),{status:401,headers:s});let e=await i.json(),{id:r}=e;return await t.DB.prepare("UPDATE rankings SET is_manual = 0 WHERE id = ?").bind(r).run(),new Response(JSON.stringify({ok:!0}),{headers:s})}let l=d.match(/^\/admin\/rankings\/(\d+)$/);if(l&&i.method==="PATCH"){if(!O(i,t))return new Response(JSON.stringify({ok:!1,message:"Unauthorized"}),{status:401,headers:s});try{let e=parseInt(l[1]),{is_manual:r}=await i.json();if(r!==0&&r!==2)return new Response(JSON.stringify({ok:!1,message:"is_manual \uAC12\uC740 0(\uD574\uC81C) \uB610\uB294 2(\uD06C\uB864\uB9C1\uACE0\uC815)\uB9CC \uD5C8\uC6A9\uB429\uB2C8\uB2E4."}),{status:400,headers:s});let a=await t.DB.prepare("SELECT id, platform, category_slot, title_ko FROM rankings WHERE id = ?").bind(e).first();return a?(await t.DB.prepare("UPDATE rankings SET is_manual = ? WHERE id = ?").bind(r,e).run(),await t.DB.prepare("INSERT INTO admin_logs (action, platform, category_slot, target_id, after_value) VALUES ('crawl_lock', ?, ?, ?, ?)").bind(a.platform,a.category_slot,String(e),JSON.stringify({is_manual:r,title_ko:a.title_ko})).run(),new Response(JSON.stringify({ok:!0,is_manual:r}),{headers:s})):new Response(JSON.stringify({ok:!1,message:"\uD574\uB2F9 \uB7AD\uD0B9\uC744 \uCC3E\uC744 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4."}),{status:404,headers:s})}catch(e){return new Response(JSON.stringify({ok:!1,message:e.message}),{status:500,headers:s})}}if(d==="/admin/categories"&&i.method==="GET"){if(!O(i,t))return new Response(JSON.stringify({ok:!1,message:"Unauthorized"}),{status:401,headers:s});try{let e=f.searchParams.get("platform"),r="SELECT * FROM ott_categories",a=[];e&&(r+=" WHERE platform = ?",a.push(e)),r+=" ORDER BY platform, category_slot";let{results:c}=a.length?await t.DB.prepare(r).bind(...a).all():await t.DB.prepare(r).all();return new Response(JSON.stringify({ok:!0,data:c}),{headers:s})}catch(e){return new Response(JSON.stringify({ok:!1,message:e.message}),{status:500,headers:s})}}if(d.match(/^\/admin\/categories\/\d+$/)&&i.method==="PATCH"){if(!O(i,t))return new Response(JSON.stringify({ok:!1,message:"Unauthorized"}),{status:401,headers:s});try{let e=parseInt(d.split("/")[3]),r=await i.json(),{display_name:a,crawl_limit:c,main_limit:p,platform_limit:m,is_active:_,main_section:u,main_order:g,platform_section:k,platform_order:E,memo_label:w,hot100_eligible:y,hot100_weight:b,person_section:N,person_order:R,person_limit:D}=r;return await t.DB.prepare(`
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
      `).bind(a??null,c??null,p??null,m??null,_??null,u===void 0?"__SKIP__":"__SET__",u===void 0?null:u||null,g===void 0?"__SKIP__":"__SET__",g===void 0?null:g??0,k===void 0?"__SKIP__":"__SET__",k===void 0?null:k||null,E===void 0?"__SKIP__":"__SET__",E===void 0?null:E??0,w===void 0?"__SKIP__":"__SET__",w===void 0?null:w||null,y===void 0?"__SKIP__":"__SET__",y===void 0?null:y??0,b??null,N===void 0?"__SKIP__":"__SET__",N===void 0?null:N||null,R===void 0?"__SKIP__":"__SET__",R===void 0?null:R??0,D??null,e).run(),await t.DB.prepare("INSERT INTO admin_logs (action, target_id, after_value) VALUES ('category_setting', ?, ?)").bind(String(e),JSON.stringify(r)).run(),new Response(JSON.stringify({ok:!0}),{headers:s})}catch(e){return new Response(JSON.stringify({ok:!1,message:e.message}),{status:500,headers:s})}}if(d==="/admin/categories"&&i.method==="POST"){if(!O(i,t))return new Response(JSON.stringify({ok:!1,message:"Unauthorized"}),{status:401,headers:s});try{let e=await i.json(),{platform:r,category_slot:a,source_name:c,display_name:p,crawl_limit:m,main_limit:_,platform_limit:u,is_active:g}=e;if(!r||!a||!c)return new Response(JSON.stringify({ok:!1,message:"platform, category_slot, source_name required"}),{status:400,headers:s});let E=((await t.DB.prepare("SELECT MAX(table_index) as max_idx FROM ott_categories WHERE platform = ?").bind(r).first())?.max_idx??-1)+1;await t.DB.prepare(`
        INSERT INTO ott_categories
          (platform, category_slot, table_index, source_name, display_name,
           crawl_limit, main_limit, platform_limit, is_active)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(platform, category_slot) DO NOTHING
      `).bind(r,a,E,c,p||c,m||20,_||10,u||20,g??1).run();let w=await t.DB.prepare("SELECT * FROM ott_categories WHERE platform = ? AND category_slot = ?").bind(r,a).first();return await t.DB.prepare("INSERT INTO admin_logs (action, platform, category_slot, after_value) VALUES ('category_create', ?, ?, ?)").bind(r,a,JSON.stringify(e)).run(),new Response(JSON.stringify({ok:!0,data:w}),{headers:s})}catch(e){return new Response(JSON.stringify({ok:!1,message:e.message}),{status:500,headers:s})}}if(d==="/admin/review-queue/count"&&i.method==="GET"){if(!O(i,t))return new Response(JSON.stringify({ok:!1,message:"Unauthorized"}),{status:401,headers:s});try{let e=await t.DB.prepare("SELECT COUNT(*) as count FROM review_queue WHERE status = 'pending'").first();return new Response(JSON.stringify({ok:!0,count:e?.count||0}),{headers:s})}catch(e){return new Response(JSON.stringify({ok:!1,message:e.message}),{status:500,headers:s})}}if(d==="/admin/review-queue"&&i.method==="GET"){if(!O(i,t))return new Response(JSON.stringify({ok:!1,message:"Unauthorized"}),{status:401,headers:s});try{let e=f.searchParams.get("status")||"pending",r=f.searchParams.get("platform"),a="SELECT * FROM review_queue WHERE status = ?",c=[e];r&&(a+=" AND platform = ?",c.push(r)),a+=" ORDER BY crawled_date DESC, platform, category_slot, rank";let{results:p}=await t.DB.prepare(a).bind(...c).all();return new Response(JSON.stringify({ok:!0,data:p}),{headers:s})}catch(e){return new Response(JSON.stringify({ok:!1,message:e.message}),{status:500,headers:s})}}if(d.match(/^\/admin\/review-queue\/\d+\/resolve$/)&&i.method==="POST"){if(!O(i,t))return new Response(JSON.stringify({ok:!1,message:"Unauthorized"}),{status:401,headers:s});try{let e=parseInt(d.split("/")[3]),r=await i.json(),{tmdb_id:a,title_ko:c,title_en:p}=r;if(!a)return new Response(JSON.stringify({ok:!1,message:"tmdb_id required"}),{status:400,headers:s});let m=await t.DB.prepare("SELECT * FROM review_queue WHERE id = ?").bind(e).first();if(!m)return new Response(JSON.stringify({ok:!1,message:"Queue item not found"}),{status:404,headers:s});let _=null,u=c,g=p;try{for(let E of["tv","movie"]){let w=await fetch(`https://api.themoviedb.org/3/${E}/${a}?language=ko-KR&api_key=${t.TMDB_API_KEY}`);if(w.ok){let y=await w.json();if(y.name||y.title){_=y.poster_path||null,u||(u=y.name||y.title);break}}}if(!g)for(let E of["tv","movie"]){let w=await fetch(`https://api.themoviedb.org/3/${E}/${a}?language=en-US&api_key=${t.TMDB_API_KEY}`);if(w.ok){let y=await w.json();if(y.name||y.title){g=y.title||y.name;break}}}}catch{}if(r.delete_duplicates===!0&&(g||m.title_en)){let E=g||m.title_en;await t.DB.prepare("DELETE FROM works WHERE title_en = ? AND tmdb_id != ?").bind(E,parseInt(a)).run(),await t.DB.prepare("INSERT INTO admin_logs (action, target_id, before_value, memo) VALUES ('works_delete', ?, ?, ?)").bind(String(a),JSON.stringify({title_en:E}),`\uC911\uBCF5 \uC0AD\uC81C: title_en="${E}" tmdb_id!=${a}`).run()}return await t.DB.prepare(`
        INSERT INTO works (tmdb_id, title_ko, title_en, poster_path, match_source, confidence_score)
        VALUES (?, ?, ?, ?, 'admin', 100)
        ON CONFLICT(tmdb_id) DO UPDATE SET
          title_ko         = COALESCE(?, title_ko),
          title_en         = COALESCE(NULLIF(?, ''), title_en),
          poster_path      = COALESCE(?, poster_path),
          match_source     = 'admin',
          confidence_score = 100,
          updated_at       = datetime('now')
      `).bind(parseInt(a),u||"",g||"",_,u||null,g||null,_).run(),await t.DB.prepare(`
        UPDATE rankings SET
          tmdb_id     = ?,
          title_ko    = COALESCE(?, title_ko),
          title_en    = COALESCE(?, title_en),
          poster_path = COALESCE(?, poster_path),
          is_manual   = 1
        WHERE platform = ? AND category_slot = ? AND rank = ? AND date = ?
      `).bind(parseInt(a),u||null,g||null,_,m.platform,m.category_slot,m.rank,m.crawled_date).run(),await t.DB.prepare(`
        UPDATE review_queue SET
          status           = 'resolved',
          resolved_tmdb_id = ?,
          resolved_at      = datetime('now')
        WHERE id = ?
      `).bind(parseInt(a),e).run(),await t.DB.prepare("INSERT INTO admin_logs (action, platform, category_slot, target_id, after_value) VALUES ('queue_resolve', ?, ?, ?, ?)").bind(m.platform,m.category_slot,String(a),JSON.stringify({tmdb_id:a,title_ko:u,title_en:g})).run(),new Response(JSON.stringify({ok:!0,poster_path:_,title_ko:u,title_en:g}),{headers:s})}catch(e){return new Response(JSON.stringify({ok:!1,message:e.message}),{status:500,headers:s})}}if(d==="/admin/rank-override"&&i.method==="POST"){if(!O(i,t))return new Response(JSON.stringify({ok:!1,message:"Unauthorized"}),{status:401,headers:s});try{let e=await i.json(),{platform:r,category_slot:a,date:c,tmdb_id:p,original_rank:m,override_rank:_,reason:u}=e;return!r||!a||!c||!p||!_?new Response(JSON.stringify({ok:!1,message:"\uD544\uC218 \uD30C\uB77C\uBBF8\uD130 \uB204\uB77D"}),{status:400,headers:s}):(await t.DB.prepare(`
        INSERT INTO rank_overrides
          (platform, category_slot, date, tmdb_id, original_rank, override_rank, reason)
        VALUES (?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(platform, category_slot, date, tmdb_id) DO UPDATE SET
          override_rank = excluded.override_rank,
          reason        = excluded.reason,
          updated_at    = datetime('now')
      `).bind(r,a,c,parseInt(p),m||0,parseInt(_),u||null).run(),await t.DB.prepare("INSERT INTO admin_logs (action, platform, category_slot, target_id, before_value, after_value) VALUES ('rank_override', ?, ?, ?, ?, ?)").bind(r,a,String(p),JSON.stringify({rank:m}),JSON.stringify({rank:_,reason:u})).run(),new Response(JSON.stringify({ok:!0}),{headers:s}))}catch(e){return new Response(JSON.stringify({ok:!1,message:e.message}),{status:500,headers:s})}}if(d==="/admin/rank-override"&&i.method==="DELETE"){if(!O(i,t))return new Response(JSON.stringify({ok:!1,message:"Unauthorized"}),{status:401,headers:s});try{let e=await i.json(),{platform:r,category_slot:a,date:c,tmdb_id:p}=e;return await t.DB.prepare("DELETE FROM rank_overrides WHERE platform = ? AND category_slot = ? AND date = ? AND tmdb_id = ?").bind(r,a,c,parseInt(p)).run(),new Response(JSON.stringify({ok:!0}),{headers:s})}catch(e){return new Response(JSON.stringify({ok:!1,message:e.message}),{status:500,headers:s})}}if(d.match(/^\/admin\/works\/\d+$/)&&i.method==="GET"){if(!O(i,t))return new Response(JSON.stringify({ok:!1,message:"Unauthorized"}),{status:401,headers:s});try{let e=parseInt(d.split("/")[3]),r=await t.DB.prepare("SELECT * FROM works WHERE tmdb_id = ?").bind(e).first();return r?new Response(JSON.stringify({ok:!0,data:r}),{headers:s}):new Response(JSON.stringify({ok:!1,message:"Not found"}),{status:404,headers:s})}catch(e){return new Response(JSON.stringify({ok:!1,message:e.message}),{status:500,headers:s})}}if(d==="/admin/works"&&i.method==="GET"){if(!O(i,t))return new Response(JSON.stringify({ok:!1,message:"Unauthorized"}),{status:401,headers:s});try{let e=f.searchParams.get("q")||"",r=f.searchParams.get("filter")||"",a=f.searchParams.get("date")||"",c=f.searchParams.get("sort")||"recent",p=parseInt(f.searchParams.get("page")||"1"),m=50,_=(p-1)*m,u=c==="updated"?"updated_at DESC, id DESC":"COALESCE(created_at, updated_at) DESC, id DESC",g,k;r==="new_match"&&a?(g=`SELECT * FROM works WHERE first_matched_date = ? AND match_source IN ('auto_claude', 'auto_tmdb') ORDER BY ${u} LIMIT ? OFFSET ?`,k=[a,m,_]):e?(g=`SELECT * FROM works WHERE title_ko LIKE ? OR title_en LIKE ? ORDER BY ${u} LIMIT ? OFFSET ?`,k=[`%${e}%`,`%${e}%`,m,_]):(g=`SELECT * FROM works ORDER BY ${u} LIMIT ? OFFSET ?`,k=[m,_]);let{results:E}=await t.DB.prepare(g).bind(...k).all();return new Response(JSON.stringify({ok:!0,data:E}),{headers:s})}catch(e){return new Response(JSON.stringify({ok:!1,message:e.message}),{status:500,headers:s})}}if(d.match(/^\/admin\/works\/\d+$/)&&i.method==="PATCH"){if(!O(i,t))return new Response(JSON.stringify({ok:!1,message:"Unauthorized"}),{status:401,headers:s});try{let e=parseInt(d.split("/")[3]),r=await i.json(),{title_ko:a,title_en:c,poster_path:p,delete_duplicates:m,media_type:_,mbti_tags:u}=r,g=_==="tv"||_==="movie"?_:null,k=u!==void 0,E=k?u||null:void 0,w=await t.DB.prepare("SELECT title_ko, title_en, poster_path, media_type FROM works WHERE tmdb_id = ?").bind(e).first();if(m&&(c||w?.title_en)){let y=c||w?.title_en;await t.DB.prepare("DELETE FROM works WHERE title_en = ? AND tmdb_id != ?").bind(y,e).run(),await t.DB.prepare("INSERT INTO admin_logs (action, target_id, before_value, memo) VALUES ('works_delete', ?, ?, ?)").bind(String(e),JSON.stringify({title_en:y}),`\uC911\uBCF5 \uC0AD\uC81C: title_en="${y}" tmdb_id!=${e}`).run()}return await t.DB.prepare(`
        UPDATE works SET
          title_ko         = COALESCE(?, title_ko),
          title_en         = COALESCE(?, title_en),
          poster_path      = COALESCE(?, poster_path),
          media_type       = ?,
          mbti_tags        = ${k?"?":"mbti_tags"},
          match_source     = 'admin',
          confidence_score = 100,
          updated_at       = datetime('now')
        WHERE tmdb_id = ?
      `).bind(a||null,c||null,p||null,g,...k?[E]:[],e).run(),await t.DB.prepare("INSERT INTO admin_logs (action, target_id, before_value, after_value) VALUES ('works_update', ?, ?, ?)").bind(String(e),JSON.stringify(w),JSON.stringify(r)).run(),new Response(JSON.stringify({ok:!0}),{headers:s})}catch(e){return new Response(JSON.stringify({ok:!1,message:e.message}),{status:500,headers:s})}}if(d.match(/^\/admin\/works\/\d+$/)&&i.method==="DELETE"){if(!O(i,t))return new Response(JSON.stringify({ok:!1,message:"Unauthorized"}),{status:401,headers:s});try{let e=parseInt(d.split("/")[3]),r=await t.DB.prepare("SELECT * FROM works WHERE tmdb_id = ?").bind(e).first();return await t.DB.prepare("DELETE FROM works WHERE tmdb_id = ?").bind(e).run(),await t.DB.prepare("INSERT INTO admin_logs (action, target_id, before_value) VALUES ('works_delete', ?, ?)").bind(String(e),JSON.stringify(r)).run(),new Response(JSON.stringify({ok:!0}),{headers:s})}catch(e){return new Response(JSON.stringify({ok:!1,message:e.message}),{status:500,headers:s})}}if(d==="/admin/new-match-count"&&i.method==="GET"){if(!O(i,t))return new Response(JSON.stringify({ok:!1,message:"Unauthorized"}),{status:401,headers:s});try{let e=f.searchParams.get("date")||new Date().toISOString().slice(0,10),r=await t.DB.prepare("SELECT COUNT(*) as count FROM works WHERE first_matched_date = ? AND match_source IN ('auto_claude','auto_tmdb')").bind(e).first();return new Response(JSON.stringify({ok:!0,count:r?.count||0,date:e}),{headers:s})}catch(e){return new Response(JSON.stringify({ok:!1,message:e.message}),{status:500,headers:s})}}if(d==="/admin/manual-rankings"&&i.method==="GET"){if(!O(i,t))return new Response(JSON.stringify({ok:!1,message:"Unauthorized"}),{status:401,headers:s});try{let e=f.searchParams.get("platform"),r=f.searchParams.get("category_slot");if(!e||!r)return new Response(JSON.stringify({ok:!1,message:"platform, category_slot required"}),{status:400,headers:s});let{results:a}=await t.DB.prepare(`
        SELECT id, rank, title_ko, title_en, tmdb_id, poster_path,
               genre, overview, release_year, tmdb_rating, source_name, memo, season
        FROM rankings
        WHERE date = 'manual' AND platform = ? AND category_slot = ?
        ORDER BY rank ASC
      `).bind(e,r).all();return new Response(JSON.stringify({ok:!0,data:a}),{headers:s})}catch(e){return new Response(JSON.stringify({ok:!1,message:e.message}),{status:500,headers:s})}}if(d==="/admin/manual-rankings"&&i.method==="POST"){if(!O(i,t))return new Response(JSON.stringify({ok:!1,message:"Unauthorized"}),{status:401,headers:s});try{let e=await i.json(),{platform:r,category_slot:a,source_name:c,tmdb_id:p,rank:m,memo:_}=e,u=e.season!==void 0?e.season:null;if(!r||!a||!p||!m)return new Response(JSON.stringify({ok:!1,message:"platform, category_slot, tmdb_id, rank required"}),{status:400,headers:s});let g=e.title_ko||"",k=e.title_en||"",E=e.poster_path||null,w=e.genre||null,y=e.overview||null,b=e.release_year||null,N=e.tmdb_rating??null,R=e.media_type==="tv"||e.media_type==="movie"?e.media_type:null;if(!g||!E||!k){let S=await t.DB.prepare("SELECT * FROM works WHERE tmdb_id = ?").bind(parseInt(p)).first();S&&(g=g||S.title_ko||"",k=k||S.title_en||"",E=E||S.poster_path||null,w=w||S.genre||null,y=y||S.overview||null,b=b||S.release_year||null,N=N??S.tmdb_rating??null)}if(!k)try{let S=R?[R]:["tv","movie"];for(let T of S){let L=await fetch(`https://api.themoviedb.org/3/${T}/${p}?language=en-US&api_key=${t.TMDB_API_KEY}`);if(!L.ok)continue;let C=await L.json();if(!C.name&&!C.title)continue;let I=C.original_title||C.original_name||"",B=C.title||C.name||"";k=/[\uAC00-\uD7A3]/.test(I)?B:I||B;break}}catch{}await t.DB.prepare(`
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
      `).bind(r,a,a,c||"",parseInt(m),g,k,parseInt(p),E,w,y,b,N,_||null,u!==null?parseInt(u):null).run();let D=new Date().toISOString();return await t.DB.prepare(`
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
      `).bind(parseInt(p),g||"",k||"",E,N,D).run(),await t.DB.prepare("INSERT INTO admin_logs (action, platform, category_slot, target_id, after_value) VALUES ('manual_ranking_add', ?, ?, ?, ?)").bind(r,a,String(p),JSON.stringify({rank:m,title_ko:g,title_en:k,memo:_})).run(),new Response(JSON.stringify({ok:!0,data:{title_ko:g,title_en:k,poster_path:E,genre:w,release_year:b,tmdb_rating:N}}),{headers:s})}catch(e){return new Response(JSON.stringify({ok:!1,message:e.message}),{status:500,headers:s})}}if(d==="/admin/manual-rankings/reorder"&&i.method==="PATCH"){if(!O(i,t))return new Response(JSON.stringify({ok:!1,message:"Unauthorized"}),{status:401,headers:s});try{let e=await i.json(),{platform:r,category_slot:a,items:c}=e;if(!r||!a||!Array.isArray(c))return new Response(JSON.stringify({ok:!1,message:"platform, category_slot, items required"}),{status:400,headers:s});let p=c.map(_=>t.DB.prepare("UPDATE rankings SET rank = ? WHERE id = ? AND date = 'manual'").bind(-parseInt(_.rank),parseInt(_.id)));await t.DB.batch(p);let m=c.map(_=>t.DB.prepare("UPDATE rankings SET rank = ?, memo = ?, season = ? WHERE id = ? AND date = 'manual'").bind(parseInt(_.rank),_.memo??null,_.season!==void 0&&_.season!==null?parseInt(_.season):null,parseInt(_.id)));return await t.DB.batch(m),await t.DB.prepare("INSERT INTO admin_logs (action, platform, category_slot, after_value) VALUES ('manual_ranking_reorder', ?, ?, ?)").bind(r,a,JSON.stringify(c)).run(),new Response(JSON.stringify({ok:!0}),{headers:s})}catch(e){return new Response(JSON.stringify({ok:!1,message:e.message}),{status:500,headers:s})}}if(d.match(/^\/admin\/manual-rankings\/\d+$/)&&i.method==="DELETE"){if(!O(i,t))return new Response(JSON.stringify({ok:!1,message:"Unauthorized"}),{status:401,headers:s});try{let e=parseInt(d.split("/")[3]),r=await t.DB.prepare("SELECT * FROM rankings WHERE id = ? AND date = 'manual'").bind(e).first();return r?(await t.DB.prepare("DELETE FROM rankings WHERE id = ? AND date = 'manual'").bind(e).run(),await t.DB.prepare("INSERT INTO admin_logs (action, platform, category_slot, target_id, before_value) VALUES ('manual_ranking_delete', ?, ?, ?, ?)").bind(r.platform,r.category_slot,String(r.tmdb_id),JSON.stringify({rank:r.rank,title_ko:r.title_ko,memo:r.memo})).run(),new Response(JSON.stringify({ok:!0}),{headers:s})):new Response(JSON.stringify({ok:!1,message:"Not found or not a manual ranking"}),{status:404,headers:s})}catch(e){return new Response(JSON.stringify({ok:!1,message:e.message}),{status:500,headers:s})}}if(d==="/admin/rankings/reorder"&&i.method==="PATCH"){if(!O(i,t))return new Response(JSON.stringify({ok:!1,message:"Unauthorized"}),{status:401,headers:s});try{let e=await i.json(),{date:r,platform:a,category_slot:c,items:p}=e;if(!r||!a||!c||!Array.isArray(p))return new Response(JSON.stringify({ok:!1,message:"date, platform, category_slot, items required"}),{status:400,headers:s});let m=p.map(u=>t.DB.prepare("UPDATE rankings SET rank = ? WHERE id = ? AND date = ? AND platform = ? AND category_slot = ?").bind(-parseInt(u.rank),parseInt(u.id),r,a,c));await t.DB.batch(m);let _=p.map(u=>t.DB.prepare("UPDATE rankings SET rank = ? WHERE id = ? AND date = ? AND platform = ? AND category_slot = ?").bind(parseInt(u.rank),parseInt(u.id),r,a,c));return await t.DB.batch(_),await t.DB.prepare("INSERT INTO admin_logs (action, platform, category_slot, after_value) VALUES ('ranking_reorder', ?, ?, ?)").bind(a,c,JSON.stringify(p)).run(),new Response(JSON.stringify({ok:!0}),{headers:s})}catch(e){return new Response(JSON.stringify({ok:!1,message:e.message}),{status:500,headers:s})}}if(d==="/admin/sync-ratings"&&i.method==="PATCH"){if(!O(i,t))return new Response(JSON.stringify({ok:!1,message:"Unauthorized"}),{status:401,headers:s});try{let{results:e}=await t.DB.prepare(`
        SELECT r.id, r.tmdb_id
        FROM rankings r
        JOIN works w ON r.tmdb_id = w.tmdb_id
        WHERE r.tmdb_rating IS NULL AND r.tmdb_id IS NOT NULL AND w.tmdb_rating IS NOT NULL
        LIMIT 500
      `).all();if(!e.length)return new Response(JSON.stringify({ok:!0,updated:0,message:"\uB3D9\uAE30\uD654\uD560 \uB370\uC774\uD130 \uC5C6\uC74C"}),{headers:s});let r=e.map(a=>t.DB.prepare("UPDATE rankings SET tmdb_rating = (SELECT tmdb_rating FROM works WHERE tmdb_id = ?) WHERE id = ?").bind(a.tmdb_id,a.id));return await t.DB.batch(r),new Response(JSON.stringify({ok:!0,updated:e.length}),{headers:s})}catch(e){return new Response(JSON.stringify({ok:!1,message:e.message}),{status:500,headers:s})}}if(d==="/admin/works/collect-keywords"&&i.method==="POST"){if(!O(i,t))return new Response(JSON.stringify({ok:!1,message:"Unauthorized"}),{status:401,headers:s});try{let e=await i.json().catch(()=>({})),r=Math.min(parseInt(e.limit)||20,50),{results:a}=await t.DB.prepare(`
        SELECT tmdb_id, media_type FROM works
        WHERE keywords IS NULL OR keywords = ''
        LIMIT ?
      `).bind(r).all();if(!a.length)return new Response(JSON.stringify({ok:!0,processed:0,attempted:0,remaining:0,message:"\uC218\uC9D1\uD560 \uC791\uD488 \uC5C6\uC74C"}),{headers:s});let c=0,p=0,m=[];for(let u of a){let g=u.media_type?[u.media_type]:["tv","movie"],k="",E=!1;for(let w of g)try{let y=await fetch(`https://api.themoviedb.org/3/${w}/${u.tmdb_id}/keywords?api_key=${t.TMDB_API_KEY}`);if(!y.ok)continue;E=!0;let b=await y.json(),N=b.keywords||b.results||[];if(N.length){k=N.map(R=>R.name).filter(Boolean).join(",");break}}catch{}k?(m.push(t.DB.prepare("UPDATE works SET keywords = ? WHERE tmdb_id = ?").bind(k,u.tmdb_id)),c++):E?m.push(t.DB.prepare("UPDATE works SET keywords = ? WHERE tmdb_id = ?").bind("__NONE__",u.tmdb_id)):p++}m.length&&await t.DB.batch(m);let _=await t.DB.prepare("SELECT COUNT(*) as cnt FROM works WHERE keywords IS NULL OR keywords = ''").first();return new Response(JSON.stringify({ok:!0,processed:c,attempted:a.length,skippedRetry:p,remaining:_?.cnt||0}),{headers:s})}catch(e){return new Response(JSON.stringify({ok:!1,message:e.message}),{status:500,headers:s})}}if(d==="/admin/works/backfill-normalize-keywords"&&i.method==="POST"){if(!O(i,t))return new Response(JSON.stringify({ok:!1,message:"Unauthorized"}),{status:401,headers:s});try{let e=await i.json().catch(()=>({})),r=Math.min(parseInt(e.limit)||200,300),{results:a}=await t.DB.prepare(`
        SELECT tmdb_id, keywords FROM works
        WHERE keywords_normalized_at IS NULL
          AND keywords IS NOT NULL AND keywords != ''
        LIMIT ?
      `).bind(r).all();if(!a.length)return new Response(JSON.stringify({ok:!0,processed:0,attempted:0,remaining:0,message:"\uC815\uADDC\uD654\uD560 \uC791\uD488 \uC5C6\uC74C"}),{headers:s});let c=[],p=0,m=new Date().toISOString();for(let u of a){if(u.keywords&&u.keywords!=="__NONE__"){let g=new Set(u.keywords.split(",").map(k=>k.trim().toLowerCase()).filter(Boolean));if(g.size){for(let k of g)c.push(t.DB.prepare("INSERT OR IGNORE INTO work_keywords (tmdb_id, keyword) VALUES (?, ?)").bind(u.tmdb_id,k)),c.push(t.DB.prepare("INSERT OR IGNORE INTO keyword_translation (keyword_en) VALUES (?)").bind(k));p++}}c.push(t.DB.prepare("UPDATE works SET keywords_normalized_at = ? WHERE tmdb_id = ?").bind(m,u.tmdb_id))}c.length&&await t.DB.batch(c);let _=await t.DB.prepare(`
        SELECT COUNT(*) as cnt FROM works
        WHERE keywords_normalized_at IS NULL
          AND keywords IS NOT NULL AND keywords != ''
      `).first();return new Response(JSON.stringify({ok:!0,processed:p,attempted:a.length,remaining:_?.cnt||0}),{headers:s})}catch(e){return new Response(JSON.stringify({ok:!1,message:e.message}),{status:500,headers:s})}}if(d==="/admin/keywords/translate"&&i.method==="POST"){if(!O(i,t))return new Response(JSON.stringify({ok:!1,message:"Unauthorized"}),{status:401,headers:s});if(!t.ANTHROPIC_API_KEY)return new Response(JSON.stringify({ok:!1,message:"ANTHROPIC_API_KEY\uAC00 Workers Secrets\uC5D0 \uC124\uC815\uB418\uC5B4 \uC788\uC9C0 \uC54A\uC2B5\uB2C8\uB2E4"}),{status:500,headers:s});try{let e=await i.json().catch(()=>({})),r=Math.min(parseInt(e.limit)||40,60),{results:a}=await t.DB.prepare(`
        SELECT keyword_en FROM keyword_translation
        WHERE source IS NULL
          AND (translate_attempts IS NULL OR translate_attempts < 3)
        LIMIT ?
      `).bind(r).all();if(!a.length)return new Response(JSON.stringify({ok:!0,attempted:0,translated:0,remaining:0,message:"\uBC88\uC5ED\uD560 \uD0A4\uC6CC\uB4DC \uC5C6\uC74C"}),{headers:s});let c=a.map(R=>`- ${R.keyword_en}`).join(`
`),p='\uB108\uB294 TMDB \uC601\uBB38 \uC791\uD488 \uD0A4\uC6CC\uB4DC(\uD14C\uB9C8/\uBD84\uC704\uAE30 \uD0DC\uADF8)\uB97C \uD55C\uAD6D OTT \uC11C\uBE44\uC2A4 \uC0AC\uC6A9\uC790\uC6A9\uC73C\uB85C \uBC88\uC5ED\uD558\uB294 \uB3C4\uC6B0\uBBF8\uB2E4. \uAC01 \uC601\uBB38 \uD0A4\uC6CC\uB4DC\uB97C \uC790\uC5F0\uC2A4\uB7FD\uACE0 \uAC04\uACB0\uD55C \uD55C\uAD6D\uC5B4 \uBA85\uC0AC\uAD6C(\uB300\uB7B5 2~8\uC790)\uB85C \uBC88\uC5ED\uD574\uB77C. \uC9C1\uC5ED\uBCF4\uB2E4 \uD55C\uAD6D \uC2DC\uCCAD\uC790\uC5D0\uAC8C \uC775\uC219\uD55C \uD45C\uD604\uC744 \uC6B0\uC120\uD574\uB77C(\uC608: revenge\u2192\uBCF5\uC218, chaebol\u2192\uC7AC\uBC8C, coming of age\u2192\uC131\uC7A5). \uC124\uBA85\uC774\uB098 \uBD80\uC5F0 \uC5C6\uC774, \uC694\uCCAD\uBC1B\uC740 \uD0A4\uC6CC\uB4DC \uC804\uBD80\uC5D0 \uB300\uD574 1:1\uB85C \uBC88\uC5ED\uD574\uB77C. \uBC18\uB4DC\uC2DC JSON \uBC30\uC5F4\uB9CC \uCD9C\uB825\uD558\uACE0, \uB2E4\uB978 \uC124\uBA85\uC774\uB098 \uCF54\uB4DC\uBE14\uB85D(```)\uC740 \uC808\uB300 \uD3EC\uD568\uD558\uC9C0 \uB9C8\uB77C. \uCD9C\uB825 \uD615\uC2DD: [{"keyword_en":"revenge","keyword_ko":"\uBCF5\uC218"}, ...]',m=`\uBC88\uC5ED\uD560 \uD0A4\uC6CC\uB4DC \uBAA9\uB85D:
${c}`,_=await fetch("https://api.anthropic.com/v1/messages",{method:"POST",headers:{"Content-Type":"application/json","x-api-key":t.ANTHROPIC_API_KEY,"anthropic-version":"2023-06-01"},body:JSON.stringify({model:"claude-haiku-4-5-20251001",max_tokens:3e3,system:p,messages:[{role:"user",content:m}]})});if(!_.ok){let R=await _.text().catch(()=>"");return new Response(JSON.stringify({ok:!1,message:`Claude API \uC624\uB958 (status ${_.status})`,detail:R.slice(0,300)}),{status:502,headers:s})}let g=((await _.json()).content||[]).filter(R=>R.type==="text").map(R=>R.text).join(""),k;try{let R=g.replace(/```json|```/g,"").trim();k=JSON.parse(R)}catch{return new Response(JSON.stringify({ok:!1,message:"Claude \uC751\uB2F5 \uD30C\uC2F1 \uC2E4\uD328 \u2014 \uB2E4\uC2DC \uC2DC\uB3C4\uD574\uC8FC\uC138\uC694",raw:g.slice(0,300)}),{status:502,headers:s})}Array.isArray(k)||(k=[]);let E=new Set(a.map(R=>R.keyword_en)),w=new Map;for(let R of k){let D=(R.keyword_en||"").trim().toLowerCase(),S=(R.keyword_ko||"").trim();!D||!S||!E.has(D)||w.set(D,S)}let y=[],b=0;for(let R of a){if(!w.has(R.keyword_en)){y.push(t.DB.prepare("UPDATE keyword_translation SET translate_attempts = COALESCE(translate_attempts, 0) + 1 WHERE keyword_en = ? AND source IS NULL").bind(R.keyword_en));continue}y.push(t.DB.prepare("UPDATE keyword_translation SET keyword_ko = ?, source = 'auto' WHERE keyword_en = ? AND source IS NULL").bind(w.get(R.keyword_en),R.keyword_en)),b++}y.length&&await t.DB.batch(y);let N=await t.DB.prepare(`
        SELECT
          SUM(CASE WHEN source IS NULL AND (translate_attempts IS NULL OR translate_attempts < 3) THEN 1 ELSE 0 END) AS remaining,
          SUM(CASE WHEN source IS NULL AND translate_attempts >= 3 THEN 1 ELSE 0 END) AS stuck
        FROM keyword_translation
      `).first();return new Response(JSON.stringify({ok:!0,attempted:a.length,translated:b,remaining:N?.remaining||0,stuck:N?.stuck||0}),{headers:s})}catch(e){return new Response(JSON.stringify({ok:!1,message:e.message}),{status:500,headers:s})}}if(d==="/admin/keywords/review"&&i.method==="GET"){if(!O(i,t))return new Response(JSON.stringify({ok:!1,message:"Unauthorized"}),{status:401,headers:s});try{let e=Math.min(parseInt(f.searchParams.get("limit"))||30,60),{results:r}=await t.DB.prepare(`
        SELECT id, keyword_en, keyword_ko
        FROM keyword_translation
        WHERE source = 'auto'
        ORDER BY id ASC
        LIMIT ?
      `).bind(e).all(),a=await t.DB.prepare("SELECT COUNT(*) as cnt FROM keyword_translation WHERE source = 'auto'").first();return new Response(JSON.stringify({ok:!0,items:r,remaining:a?.cnt||0}),{headers:s})}catch(e){return new Response(JSON.stringify({ok:!1,message:e.message}),{status:500,headers:s})}}if(d==="/admin/keywords/review"&&i.method==="POST"){if(!O(i,t))return new Response(JSON.stringify({ok:!1,message:"Unauthorized"}),{status:401,headers:s});try{let e=await i.json().catch(()=>({})),a=(Array.isArray(e.items)?e.items:[]).filter(m=>m&&m.id&&typeof m.keyword_ko=="string"&&m.keyword_ko.trim());if(!a.length)return new Response(JSON.stringify({ok:!1,message:"\uC720\uD6A8\uD55C \uD56D\uBAA9\uC774 \uC5C6\uC5B4\uC694"}),{status:400,headers:s});let c=a.map(m=>t.DB.prepare("UPDATE keyword_translation SET keyword_ko = ?, source = 'admin' WHERE id = ?").bind(m.keyword_ko.trim(),parseInt(m.id)));await t.DB.batch(c);let p=await t.DB.prepare("SELECT COUNT(*) as cnt FROM keyword_translation WHERE source = 'auto'").first();return new Response(JSON.stringify({ok:!0,updated:a.length,remaining:p?.cnt||0}),{headers:s})}catch(e){return new Response(JSON.stringify({ok:!1,message:e.message}),{status:500,headers:s})}}if(d==="/admin/keywords/search"&&i.method==="GET"){if(!O(i,t))return new Response(JSON.stringify({ok:!1,message:"Unauthorized"}),{status:401,headers:s});try{let e=(f.searchParams.get("q")||"").trim();if(!e)return new Response(JSON.stringify({ok:!1,message:"\uAC80\uC0C9\uC5B4(q)\uAC00 \uD544\uC694\uD574\uC694"}),{status:400,headers:s});let r=`%${e}%`,{results:a}=await t.DB.prepare(`
        SELECT id, keyword_en, keyword_ko, source
        FROM keyword_translation
        WHERE keyword_en LIKE ? OR keyword_ko LIKE ?
        ORDER BY keyword_en ASC
        LIMIT 50
      `).bind(r,r).all();return new Response(JSON.stringify({ok:!0,items:a}),{headers:s})}catch(e){return new Response(JSON.stringify({ok:!1,message:e.message}),{status:500,headers:s})}}if(d==="/admin/keywords/update"&&i.method==="POST"){if(!O(i,t))return new Response(JSON.stringify({ok:!1,message:"Unauthorized"}),{status:401,headers:s});try{let e=await i.json().catch(()=>({})),r=(e.keyword_en||"").trim(),a=(e.keyword_ko||"").trim();if(!r||!a)return new Response(JSON.stringify({ok:!1,message:"keyword_en, keyword_ko \uBAA8\uB450 \uD544\uC694\uD574\uC694"}),{status:400,headers:s});let c=await t.DB.prepare("UPDATE keyword_translation SET keyword_ko = ?, source = 'admin' WHERE keyword_en = ?").bind(a,r).run();return!c.meta||c.meta.changes===0?new Response(JSON.stringify({ok:!1,message:"\uD574\uB2F9 keyword_en\uC744 \uCC3E\uC9C0 \uBABB\uD588\uC5B4\uC694"}),{status:404,headers:s}):new Response(JSON.stringify({ok:!0}),{headers:s})}catch(e){return new Response(JSON.stringify({ok:!1,message:e.message}),{status:500,headers:s})}}if(d==="/admin/works/discover-collect"&&i.method==="POST"){if(!O(i,t))return new Response(JSON.stringify({ok:!1,message:"Unauthorized"}),{status:401,headers:s});try{let e=await i.json().catch(()=>({})),r=e.media_type,a=Math.max(parseInt(e.page)||1,1);if(!["movie","tv"].includes(r))return new Response(JSON.stringify({ok:!1,message:"media_type\uC740 'movie' \uB610\uB294 'tv'\uB9CC \uD5C8\uC6A9"}),{status:400,headers:s});let c=r==="movie"?`https://api.themoviedb.org/3/discover/movie?api_key=${t.TMDB_API_KEY}&language=ko-KR&region=KR&with_original_language=ko&sort_by=popularity.desc&page=${a}`:`https://api.themoviedb.org/3/discover/tv?api_key=${t.TMDB_API_KEY}&language=ko-KR&with_origin_country=KR&sort_by=popularity.desc&page=${a}`,p=await fetch(c);if(!p.ok)return new Response(JSON.stringify({ok:!1,message:`TMDB discover \uC870\uD68C \uC2E4\uD328 (status ${p.status})`}),{status:502,headers:s});let m=await p.json(),_=m.results||[],u=m.total_pages||1;if(!_.length)return new Response(JSON.stringify({ok:!0,attempted:0,inserted:0,skipped:0,hasNextPage:!1,nextPage:a+1,totalPages:u}),{headers:s});let g=_.map(R=>R.id),k=g.map(()=>"?").join(","),{results:E}=await t.DB.prepare(`SELECT tmdb_id FROM works WHERE tmdb_id IN (${k})`).bind(...g).all(),w=new Set((E||[]).map(R=>R.tmdb_id)),y=_.filter(R=>!w.has(R.id)),b=[],N=0;for(let R of y){let D=null,S=null,T=null,L=null,C=null,I=null,B="";try{let J=await fetch(`https://api.themoviedb.org/3/${r}/${R.id}?language=ko-KR&api_key=${t.TMDB_API_KEY}`);if(J.ok){let M=await J.json();D=M.name||M.title||R.name||R.title||null,T=M.poster_path||R.poster_path||null,L=(M.genres||[]).map(W=>W.name).join(", ")||null,C=M.vote_average?parseFloat(M.vote_average.toFixed(1)):null,I=parseInt((M.first_air_date||M.release_date||"").slice(0,4))||null,B=M.overview||R.overview||""}}catch{}if(D){try{let J=await fetch(`https://api.themoviedb.org/3/${r}/${R.id}?language=en-US&api_key=${t.TMDB_API_KEY}`);if(J.ok){let M=await J.json(),W=M.original_title||M.original_name||"",K=M.title||M.name||"";S=/[\uAC00-\uD7A3]/.test(W)?K:W||K}}catch{}b.push(t.DB.prepare(`
            INSERT INTO works
              (tmdb_id, title_ko, title_en, overview, genre, release_year,
               tmdb_rating, poster_path, media_type, match_source, confidence_score, first_matched_date)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'auto_discover', 90, date('now'))
            ON CONFLICT(tmdb_id) DO NOTHING
          `).bind(R.id,D,S||"",B||"",L||"",I,C,T,r)),N++}}return b.length&&await t.DB.batch(b),new Response(JSON.stringify({ok:!0,attempted:_.length,inserted:N,skipped:_.length-y.length,hasNextPage:a<u,nextPage:a+1,totalPages:u}),{headers:s})}catch(e){return new Response(JSON.stringify({ok:!1,message:e.message}),{status:500,headers:s})}}if(d==="/admin/works/classify-variety"&&i.method==="POST"){if(!O(i,t))return new Response(JSON.stringify({ok:!1,message:"Unauthorized"}),{status:401,headers:s});if(!t.ANTHROPIC_API_KEY)return new Response(JSON.stringify({ok:!1,message:"ANTHROPIC_API_KEY\uAC00 Workers Secrets\uC5D0 \uC124\uC815\uB418\uC5B4 \uC788\uC9C0 \uC54A\uC2B5\uB2C8\uB2E4"}),{status:500,headers:s});try{let e=await i.json().catch(()=>({})),r=Math.min(parseInt(e.limit)||10,15),{results:a}=await t.DB.prepare("SELECT label FROM variety_genre_options ORDER BY sort_order ASC").all();if(!a.length)return new Response(JSON.stringify({ok:!1,message:"variety_genre_options\uC5D0 \uD0DC\uADF8\uAC00 \uD558\uB098\uB3C4 \uC5C6\uC2B5\uB2C8\uB2E4. \uBA3C\uC800 \uD0DC\uADF8\uB97C \uB4F1\uB85D\uD574\uC8FC\uC138\uC694."}),{status:400,headers:s});let c=a.map(S=>S.label),{results:p}=await t.DB.prepare(`
        SELECT tmdb_id, title_ko, overview, genre
        FROM works
        WHERE original_language = 'ko'
          AND variety_genre_source IS NULL
          AND (
            genre LIKE '%Reality%' OR genre LIKE '%Talk%' OR
            genre LIKE '%\uB2E4\uD050\uBA58\uD130\uB9AC%' OR genre LIKE '%\uB9AC\uC5BC\uB9AC\uD2F0%' OR genre LIKE '%\uD1A0\uD06C%'
          )
        LIMIT ?
      `).bind(r).all();if(!p.length)return new Response(JSON.stringify({ok:!0,attempted:0,classified:0,remaining:0,message:"\uBD84\uB958\uD560 \uC791\uD488 \uC5C6\uC74C"}),{headers:s});let m=p.map(S=>`- tmdb_id:${S.tmdb_id} / \uC81C\uBAA9:"${S.title_ko||""}" / \uC904\uAC70\uB9AC:"${(S.overview||"").slice(0,200)}"`).join(`
`),_='\uB108\uB294 \uD55C\uAD6D \uC608\uB2A5 \uD504\uB85C\uADF8\uB7A8\uC744 \uBD84\uB958\uD558\uB294 \uB3C4\uC6B0\uBBF8\uB2E4. \uC544\uB798 \uD0DC\uADF8 \uBAA9\uB85D \uC911\uC5D0\uC11C\uB9CC \uACE8\uB77C\uC57C \uD558\uBA70, \uBAA9\uB85D\uC5D0 \uC5C6\uB294 \uD0DC\uADF8\uB294 \uC808\uB300 \uB9CC\uB4E4\uC5B4\uB0B4\uC9C0 \uB9C8\uB77C. \uAC01 \uC791\uD488\uB9C8\uB2E4 \uAC00\uC7A5 \uC5B4\uC6B8\uB9AC\uB294 \uD0DC\uADF8\uB97C \uCD5C\uB300 2\uAC1C\uAE4C\uC9C0 \uACE0\uB974\uACE0, \uC560\uB9E4\uD558\uBA74 1\uAC1C\uB9CC \uACE0\uB974\uAC70\uB098 "\uC77C\uBC18 \uC608\uB2A5"\uC744 \uC120\uD0DD\uD574\uB77C. \uC608\uB2A5\uC774 \uC544\uB2C8\uB77C\uACE0 \uD310\uB2E8\uB418\uBA74(\uB4DC\uB77C\uB9C8/\uC601\uD654/\uB2E4\uD050 \uB4F1) tags\uB97C \uBE48 \uBC30\uC5F4\uB85C \uB0A8\uACA8\uB77C. \uBC18\uB4DC\uC2DC JSON \uBC30\uC5F4\uB9CC \uCD9C\uB825\uD558\uACE0, \uB2E4\uB978 \uC124\uBA85\uC774\uB098 \uCF54\uB4DC\uBE14\uB85D(```)\uC740 \uC808\uB300 \uD3EC\uD568\uD558\uC9C0 \uB9C8\uB77C. \uCD9C\uB825 \uD615\uC2DD: [{"tmdb_id":123,"tags":["\uC5EC\uD589 \uC608\uB2A5"]}, ...]',u=`\uD0DC\uADF8 \uBAA9\uB85D: ${c.join(", ")}

\uC791\uD488 \uBAA9\uB85D:
${m}`,g=await fetch("https://api.anthropic.com/v1/messages",{method:"POST",headers:{"Content-Type":"application/json","x-api-key":t.ANTHROPIC_API_KEY,"anthropic-version":"2023-06-01"},body:JSON.stringify({model:"claude-haiku-4-5-20251001",max_tokens:2e3,system:_,messages:[{role:"user",content:u}]})});if(!g.ok){let S=await g.text().catch(()=>"");return new Response(JSON.stringify({ok:!1,message:`Claude API \uC624\uB958 (status ${g.status})`,detail:S.slice(0,300)}),{status:502,headers:s})}let E=((await g.json()).content||[]).filter(S=>S.type==="text").map(S=>S.text).join(""),w;try{let S=E.replace(/```json|```/g,"").trim();w=JSON.parse(S)}catch{return new Response(JSON.stringify({ok:!1,message:"Claude \uC751\uB2F5 \uD30C\uC2F1 \uC2E4\uD328 \u2014 \uB2E4\uC2DC \uC2DC\uB3C4\uD574\uC8FC\uC138\uC694",raw:E.slice(0,300)}),{status:502,headers:s})}Array.isArray(w)||(w=[]);let y=new Set(c),b=new Map;for(let S of w){let T=parseInt(S.tmdb_id);if(!T)continue;let L=Array.isArray(S.tags)?S.tags.filter(C=>y.has(C)).slice(0,2):[];b.set(T,L)}let N=[],R=0;for(let S of p){if(!b.has(S.tmdb_id))continue;let T=b.get(S.tmdb_id);N.push(t.DB.prepare("UPDATE works SET variety_genre = ?, variety_genre_source = 'auto' WHERE tmdb_id = ?").bind(T.length?T.join(","):null,S.tmdb_id)),R++}N.length&&await t.DB.batch(N);let D=await t.DB.prepare(`
        SELECT COUNT(*) as cnt FROM works
        WHERE original_language = 'ko' AND variety_genre_source IS NULL
          AND (genre LIKE '%Reality%' OR genre LIKE '%Talk%' OR genre LIKE '%\uB2E4\uD050\uBA58\uD130\uB9AC%' OR genre LIKE '%\uB9AC\uC5BC\uB9AC\uD2F0%' OR genre LIKE '%\uD1A0\uD06C%')
      `).first();return new Response(JSON.stringify({ok:!0,attempted:p.length,classified:R,remaining:D?.cnt||0}),{headers:s})}catch(e){return new Response(JSON.stringify({ok:!1,message:e.message}),{status:500,headers:s})}}if(d==="/admin/variety-genre-options"&&i.method==="GET"){if(!O(i,t))return new Response(JSON.stringify({ok:!1,message:"Unauthorized"}),{status:401,headers:s});try{let{results:e}=await t.DB.prepare("SELECT id, label, sort_order FROM variety_genre_options ORDER BY sort_order ASC").all();return new Response(JSON.stringify({ok:!0,data:e}),{headers:s})}catch(e){return new Response(JSON.stringify({ok:!1,message:e.message}),{status:500,headers:s})}}if(d==="/admin/works/variety-review"&&i.method==="GET"){if(!O(i,t))return new Response(JSON.stringify({ok:!1,message:"Unauthorized"}),{status:401,headers:s});try{let e=Math.min(parseInt(f.searchParams.get("limit"))||12,30),{results:r}=await t.DB.prepare(`
        SELECT tmdb_id, title_ko, poster_path, variety_genre, media_type
        FROM works
        WHERE variety_genre_source = 'auto'
        ORDER BY (variety_review_skipped_at IS NULL) DESC, variety_review_skipped_at ASC, tmdb_id ASC
        LIMIT ?
      `).bind(e).all(),a=await t.DB.prepare("SELECT COUNT(*) as cnt FROM works WHERE variety_genre_source = 'auto'").first();return new Response(JSON.stringify({ok:!0,items:r,remaining:a?.cnt||0}),{headers:s})}catch(e){return new Response(JSON.stringify({ok:!1,message:e.message}),{status:500,headers:s})}}if(d==="/admin/works/variety-review"&&i.method==="POST"){if(!O(i,t))return new Response(JSON.stringify({ok:!1,message:"Unauthorized"}),{status:401,headers:s});try{let e=await i.json().catch(()=>({})),a=(Array.isArray(e.items)?e.items:[]).filter(m=>m&&m.tmdb_id&&Array.isArray(m.tags));if(!a.length)return new Response(JSON.stringify({ok:!1,message:"\uC720\uD6A8\uD55C \uD56D\uBAA9\uC774 \uC5C6\uC5B4\uC694"}),{status:400,headers:s});let c=a.map(m=>{let _=m.tags.filter(Boolean).slice(0,2);return t.DB.prepare("UPDATE works SET variety_genre = ?, variety_genre_source = 'admin' WHERE tmdb_id = ?").bind(_.length?_.join(","):null,parseInt(m.tmdb_id))});await t.DB.batch(c);let p=await t.DB.prepare("SELECT COUNT(*) as cnt FROM works WHERE variety_genre_source = 'auto'").first();return new Response(JSON.stringify({ok:!0,updated:a.length,remaining:p?.cnt||0}),{headers:s})}catch(e){return new Response(JSON.stringify({ok:!1,message:e.message}),{status:500,headers:s})}}if(d==="/admin/works/variety-review/skip"&&i.method==="POST"){if(!O(i,t))return new Response(JSON.stringify({ok:!1,message:"Unauthorized"}),{status:401,headers:s});try{let e=await i.json().catch(()=>({})),r=Array.isArray(e.tmdb_ids)?e.tmdb_ids.map(p=>parseInt(p)).filter(p=>Number.isInteger(p)):[];if(!r.length)return new Response(JSON.stringify({ok:!1,message:"tmdb_ids required"}),{status:400,headers:s});let a=new Date().toISOString(),c=r.map(p=>t.DB.prepare("UPDATE works SET variety_review_skipped_at = ? WHERE tmdb_id = ?").bind(a,p));return await t.DB.batch(c),new Response(JSON.stringify({ok:!0,skipped:r.length}),{headers:s})}catch(e){return new Response(JSON.stringify({ok:!1,message:e.message}),{status:500,headers:s})}}if(d==="/admin/works/pinned-similar"&&i.method==="POST"){if(!O(i,t))return new Response(JSON.stringify({ok:!1,message:"Unauthorized"}),{status:401,headers:s});try{let e=await i.json().catch(()=>({})),r=parseInt(e.tmdb_id),a=parseInt(e.related_tmdb_id),c=parseInt(e.pinned_pct);if((!c||c<1||c>99)&&(c=99),!r||!a)return new Response(JSON.stringify({ok:!1,message:"\uB450 \uC791\uD488\uC758 tmdb_id\uAC00 \uBAA8\uB450 \uD544\uC694\uD569\uB2C8\uB2E4"}),{status:400,headers:s});if(r===a)return new Response(JSON.stringify({ok:!1,message:"\uAC19\uC740 \uC791\uD488\uB07C\uB9AC\uB294 \uC5F0\uACB0\uD560 \uC218 \uC5C6\uC5B4\uC694"}),{status:400,headers:s});let{results:p}=await t.DB.prepare("SELECT tmdb_id FROM works WHERE tmdb_id IN (?, ?)").bind(r,a).all();return p.length<2?new Response(JSON.stringify({ok:!1,message:"works \uD14C\uC774\uBE14\uC5D0 \uC5C6\uB294 \uC791\uD488\uC774 \uD3EC\uD568\uB418\uC5B4 \uC788\uC5B4\uC694"}),{status:400,headers:s}):(await t.DB.batch([t.DB.prepare(`
          INSERT INTO work_pinned_similar (tmdb_id, related_tmdb_id, pinned_pct)
          VALUES (?, ?, ?)
          ON CONFLICT(tmdb_id, related_tmdb_id) DO UPDATE SET pinned_pct = excluded.pinned_pct
        `).bind(r,a,c),t.DB.prepare(`
          INSERT INTO work_pinned_similar (tmdb_id, related_tmdb_id, pinned_pct)
          VALUES (?, ?, ?)
          ON CONFLICT(tmdb_id, related_tmdb_id) DO UPDATE SET pinned_pct = excluded.pinned_pct
        `).bind(a,r,c)]),new Response(JSON.stringify({ok:!0,pinned_pct:c}),{headers:s}))}catch(e){return new Response(JSON.stringify({ok:!1,message:e.message}),{status:500,headers:s})}}if(d.startsWith("/admin/works/pinned-similar/")&&i.method==="GET"){if(!O(i,t))return new Response(JSON.stringify({ok:!1,message:"Unauthorized"}),{status:401,headers:s});try{let e=parseInt(d.split("/admin/works/pinned-similar/")[1]);if(!e)return new Response(JSON.stringify({ok:!1,message:"tmdb_id required"}),{status:400,headers:s});let{results:r}=await t.DB.prepare(`
        SELECT w.tmdb_id, w.title_ko, w.title_en, w.poster_path, p.pinned_pct
        FROM work_pinned_similar p
        JOIN works w ON w.tmdb_id = p.related_tmdb_id
        WHERE p.tmdb_id = ?
        ORDER BY p.pinned_pct DESC
      `).bind(e).all();return new Response(JSON.stringify({ok:!0,data:r}),{headers:s})}catch(e){return new Response(JSON.stringify({ok:!1,message:e.message}),{status:500,headers:s})}}if(d==="/admin/works/pinned-similar"&&i.method==="DELETE"){if(!O(i,t))return new Response(JSON.stringify({ok:!1,message:"Unauthorized"}),{status:401,headers:s});try{let e=await i.json().catch(()=>({})),r=parseInt(e.tmdb_id),a=parseInt(e.related_tmdb_id);return!r||!a?new Response(JSON.stringify({ok:!1,message:"\uB450 \uC791\uD488\uC758 tmdb_id\uAC00 \uBAA8\uB450 \uD544\uC694\uD569\uB2C8\uB2E4"}),{status:400,headers:s}):(await t.DB.prepare(`
        DELETE FROM work_pinned_similar
        WHERE (tmdb_id = ? AND related_tmdb_id = ?) OR (tmdb_id = ? AND related_tmdb_id = ?)
      `).bind(r,a,a,r).run(),new Response(JSON.stringify({ok:!0}),{headers:s}))}catch(e){return new Response(JSON.stringify({ok:!1,message:e.message}),{status:500,headers:s})}}if(d==="/admin/persons/collect"&&i.method==="POST"){if(!O(i,t))return new Response(JSON.stringify({ok:!1,message:"Unauthorized"}),{status:401,headers:s});try{let e=await i.json().catch(()=>({})),r=Math.min(parseInt(e.limit)||20,50),{results:a}=await t.DB.prepare(`
        SELECT tmdb_id, media_type FROM works
        WHERE credits_scanned IS NULL OR credits_scanned = 0
        LIMIT ?
      `).bind(r).all();if(!a.length)return new Response(JSON.stringify({ok:!0,worksScanned:0,personsFound:0,remaining:0,message:"\uC2A4\uCE94\uD560 \uC791\uD488 \uC5C6\uC74C"}),{headers:s});let c=new Map,p=[];for(let u of a){p.push(u.tmdb_id);let g=u.media_type==="tv"?"tv":"movie",k=g==="tv"?"aggregate_credits":"credits";try{let E=await fetch(`https://api.themoviedb.org/3/${g}/${u.tmdb_id}/${k}?api_key=${t.TMDB_API_KEY}`);if(!E.ok)continue;let w=await E.json();for(let y of(w.cast||[]).slice(0,15))y.id&&y.name&&!c.has(y.id)&&c.set(y.id,{name:y.name,job:"act"});for(let y of w.crew||[])(y.job==="Director"||y.job==="Creator"||y.department==="Directing"||(y.jobs||[]).some(N=>N.job==="Director"||N.job==="Creator"))&&y.id&&y.name&&c.set(y.id,{name:y.name,job:"direct"})}catch{}}let m=[];for(let[u,g]of c)m.push(t.DB.prepare(`INSERT INTO persons (tmdb_id, name, job) VALUES (?, ?, ?)
             ON CONFLICT(tmdb_id) DO NOTHING`).bind(u,g.name,g.job));for(let u of p)m.push(t.DB.prepare("UPDATE works SET credits_scanned = 1 WHERE tmdb_id = ?").bind(u));m.length&&await t.DB.batch(m);let _=await t.DB.prepare("SELECT COUNT(*) as cnt FROM works WHERE credits_scanned IS NULL OR credits_scanned = 0").first();return new Response(JSON.stringify({ok:!0,worksScanned:a.length,personsFound:c.size,remaining:_?.cnt||0}),{headers:s})}catch(e){return new Response(JSON.stringify({ok:!1,message:e.message}),{status:500,headers:s})}}if(d==="/admin/works/backfill-language"&&i.method==="POST"){if(!O(i,t))return new Response(JSON.stringify({ok:!1,message:"Unauthorized"}),{status:401,headers:s});try{let e=await i.json().catch(()=>({})),r=Math.min(parseInt(e.limit)||30,50),{results:a}=await t.DB.prepare(`
        SELECT tmdb_id, media_type FROM works
        WHERE original_language IS NULL
        LIMIT ?
      `).bind(r).all();if(!a.length)return new Response(JSON.stringify({ok:!0,attempted:0,filled:0,remaining:0,message:"\uCC44\uC6B8 \uC791\uD488 \uC5C6\uC74C"}),{headers:s});let c=[],p=0;for(let _ of a){let u=_.media_type?[_.media_type]:["tv","movie"],g=null;for(let k of u)try{let E=await fetch(`https://api.themoviedb.org/3/${k}/${_.tmdb_id}?api_key=${t.TMDB_API_KEY}`);if(!E.ok)continue;let w=await E.json();if(w.original_language){g=w.original_language;break}}catch{}g?(c.push(t.DB.prepare("UPDATE works SET original_language = ? WHERE tmdb_id = ?").bind(g,_.tmdb_id)),p++):c.push(t.DB.prepare("UPDATE works SET original_language = 'unknown' WHERE tmdb_id = ?").bind(_.tmdb_id))}c.length&&await t.DB.batch(c);let m=await t.DB.prepare("SELECT COUNT(*) as cnt FROM works WHERE original_language IS NULL").first();return new Response(JSON.stringify({ok:!0,attempted:a.length,filled:p,remaining:m?.cnt||0}),{headers:s})}catch(e){return new Response(JSON.stringify({ok:!1,message:e.message}),{status:500,headers:s})}}if(d==="/admin/works/backfill-release-year"&&i.method==="POST"){if(!O(i,t))return new Response(JSON.stringify({ok:!1,message:"Unauthorized"}),{status:401,headers:s});try{let e=await i.json().catch(()=>({})),r=Math.min(parseInt(e.limit)||30,50),{results:a}=await t.DB.prepare(`
        SELECT tmdb_id, media_type FROM works
        WHERE release_year IS NULL
        LIMIT ?
      `).bind(r).all();if(!a.length)return new Response(JSON.stringify({ok:!0,attempted:0,filled:0,remaining:0,message:"\uCC44\uC6B8 \uC791\uD488 \uC5C6\uC74C"}),{headers:s});let c=[],p=0;for(let _ of a){let u=_.media_type?[_.media_type]:["tv","movie"],g=null;for(let k of u)try{let E=await fetch(`https://api.themoviedb.org/3/${k}/${_.tmdb_id}?api_key=${t.TMDB_API_KEY}`);if(!E.ok)continue;let w=await E.json(),y=w.release_date||w.first_air_date||"",b=parseInt(y.slice(0,4));if(b){g=b;break}}catch{}g?(c.push(t.DB.prepare("UPDATE works SET release_year = ? WHERE tmdb_id = ?").bind(g,_.tmdb_id)),p++):c.push(t.DB.prepare("UPDATE works SET release_year = 0 WHERE tmdb_id = ?").bind(_.tmdb_id))}c.length&&await t.DB.batch(c);let m=await t.DB.prepare("SELECT COUNT(*) as cnt FROM works WHERE release_year IS NULL").first();return new Response(JSON.stringify({ok:!0,attempted:a.length,filled:p,remaining:m?.cnt||0}),{headers:s})}catch(e){return new Response(JSON.stringify({ok:!1,message:e.message}),{status:500,headers:s})}}if(d==="/admin/works/backfill-rating"&&i.method==="POST"){if(!O(i,t))return new Response(JSON.stringify({ok:!1,message:"Unauthorized"}),{status:401,headers:s});try{let e=await i.json().catch(()=>({})),r=Math.min(parseInt(e.limit)||30,50),{results:a}=await t.DB.prepare(`
        SELECT tmdb_id, media_type FROM works
        WHERE tmdb_rating IS NULL AND rating_updated_at IS NULL
        LIMIT ?
      `).bind(r).all();if(!a.length)return new Response(JSON.stringify({ok:!0,attempted:0,filled:0,remaining:0,message:"\uCC44\uC6B8 \uC791\uD488 \uC5C6\uC74C"}),{headers:s});let c=[],p=0,m=new Date().toISOString();for(let u of a){let g=u.media_type?[u.media_type]:["tv","movie"],k=null,E=null,w=!1;for(let y of g)try{let b=await fetch(`https://api.themoviedb.org/3/${y}/${u.tmdb_id}?api_key=${t.TMDB_API_KEY}`);if(!b.ok)continue;let N=await b.json();w=!0,k=N.vote_average??null,E=N.release_date||N.first_air_date||null;break}catch{}w?(c.push(t.DB.prepare("UPDATE works SET tmdb_rating = ?, release_date = ?, rating_updated_at = ? WHERE tmdb_id = ?").bind(k,E,m,u.tmdb_id)),k!==null&&p++):c.push(t.DB.prepare("UPDATE works SET rating_updated_at = ? WHERE tmdb_id = ?").bind(m,u.tmdb_id))}c.length&&await t.DB.batch(c);let _=await t.DB.prepare("SELECT COUNT(*) as cnt FROM works WHERE tmdb_rating IS NULL AND rating_updated_at IS NULL").first();return new Response(JSON.stringify({ok:!0,attempted:a.length,filled:p,remaining:_?.cnt||0}),{headers:s})}catch(e){return new Response(JSON.stringify({ok:!1,message:e.message}),{status:500,headers:s})}}if(d==="/admin/works/batch-imdb-search"&&i.method==="POST"){if(!O(i,t))return new Response(JSON.stringify({ok:!1,message:"Unauthorized"}),{status:401,headers:s});try{let e=30;try{let g=await i.json();g?.limit&&Number.isInteger(g.limit)&&g.limit>0&&(e=g.limit)}catch{}let r=t.OMDB_API_KEY;if(!r)return new Response(JSON.stringify({ok:!1,message:"OMDB key not configured"}),{status:500,headers:s});let c=(await t.DB.prepare("SELECT MAX(date) AS latest_date FROM rankings WHERE date != 'manual'").first())?.latest_date||null,{results:p}=await t.DB.prepare(`
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
      `).bind(c,e).all();if(!p.length)return new Response(JSON.stringify({ok:!0,attempted:0,filled:0,remaining:0,message:"\uB300\uC0C1 \uC791\uD488 \uC5C6\uC74C (\uBAA8\uB450 \uB9E4\uCE6D \uC644\uB8CC\uB410\uAC70\uB098 \uCFE8\uB2E4\uC6B4 \uC911)"}),{headers:s});let m=0,_=new Date().toISOString();for(let g of p)try{if(!g.title_en){await t.DB.prepare("UPDATE works SET imdb_search_attempted_at = ? WHERE tmdb_id = ?").bind(_,g.tmdb_id).run();continue}let k=g.media_type==="movie"?"movie":"series",E=new URLSearchParams({t:g.title_en,type:k,apikey:r});g.release_year&&E.set("y",String(g.release_year));let y=await(await fetch(`https://www.omdbapi.com/?${E.toString()}`)).json();if(y.Response!=="False"&&/^tt\d+$/.test(y.imdbID||"")){let b=parseFloat(y.imdbRating);if(isNaN(b))await t.DB.prepare("UPDATE works SET imdb_id = ?, imdb_search_attempted_at = ? WHERE tmdb_id = ?").bind(y.imdbID,_,g.tmdb_id).run();else{let N=y.imdbVotes||"";await t.DB.prepare("UPDATE works SET imdb_id = ?, imdb_rating = ?, imdb_votes = ?, imdb_updated = ?, imdb_search_attempted_at = ? WHERE tmdb_id = ?").bind(y.imdbID,b,N,_,_,g.tmdb_id).run()}m++}else await t.DB.prepare("UPDATE works SET imdb_search_attempted_at = ? WHERE tmdb_id = ?").bind(_,g.tmdb_id).run()}catch(k){console.error(`[IMDB_BATCH_SEARCH] tmdb_id=${g.tmdb_id} \uC624\uB958:`,k.message)}let u=await t.DB.prepare(`
        SELECT COUNT(*) AS cnt FROM works w
        WHERE (w.imdb_id IS NULL OR w.imdb_id = '')
        AND (
          w.imdb_search_attempted_at IS NULL
          OR w.imdb_search_attempted_at < datetime('now', '-7 days')
        )
      `).first();return console.log(`[IMDB_BATCH_SEARCH] \u2705 \uC644\uB8CC: \uC2DC\uB3C4 ${p.length}\uAC74, \uB9E4\uCE6D ${m}\uAC1C`),new Response(JSON.stringify({ok:!0,attempted:p.length,filled:m,remaining:u?.cnt||0}),{headers:s})}catch(e){return new Response(JSON.stringify({ok:!1,message:e.message}),{status:500,headers:s})}}if(d==="/admin/works/imdb-manual"&&i.method==="POST"){if(!O(i,t))return new Response(JSON.stringify({ok:!1,message:"Unauthorized"}),{status:401,headers:s});try{let e=await i.json(),r=parseInt(e?.tmdb_id);if(!r)return new Response(JSON.stringify({ok:!1,message:"tmdb_id required"}),{status:400,headers:s});let a=e?.imdb_rating===""||e?.imdb_rating==null?null:parseFloat(e.imdb_rating);if(a!==null&&(isNaN(a)||a<0||a>10))return new Response(JSON.stringify({ok:!1,message:"imdb_rating\uC740 0~10 \uC0AC\uC774 \uC22B\uC790\uC5EC\uC57C \uD569\uB2C8\uB2E4"}),{status:400,headers:s});let c=(e?.imdb_votes||"").toString().trim()||null,p=await t.DB.prepare("SELECT imdb_id FROM works WHERE tmdb_id = ?").bind(r).first();return p?(await t.DB.prepare("UPDATE works SET imdb_rating = ?, imdb_votes = ?, imdb_updated = datetime('now') WHERE tmdb_id = ?").bind(a,c,r).run(),new Response(JSON.stringify({ok:!0,warning:p.imdb_id?null:"imdb_id\uAC00 \uC5C6\uB294 \uC791\uD488\uC774\uB77C \uD654\uBA74\uC5D0 \uCE74\uB4DC\uAC00 \uC548 \uB730 \uC218 \uC788\uC2B5\uB2C8\uB2E4 (IMDb \uB9E4\uCE6D \uBC30\uCE58 \uC120\uD589 \uD544\uC694)"}),{headers:s})):new Response(JSON.stringify({ok:!1,message:"\uD574\uB2F9 tmdb_id \uC791\uD488\uC744 \uCC3E\uC744 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4"}),{status:404,headers:s})}catch(e){return new Response(JSON.stringify({ok:!1,message:e.message}),{status:500,headers:s})}}if(d==="/admin/works/missing-media-type"&&i.method==="GET"){if(!O(i,t))return new Response(JSON.stringify({ok:!1,message:"Unauthorized"}),{status:401,headers:s});try{let e=Math.min(parseInt(f.searchParams.get("limit"))||10,30),{results:r}=await t.DB.prepare(`
        SELECT tmdb_id, title_ko, poster_path
        FROM works
        WHERE media_type IS NULL OR media_type = ''
        ORDER BY tmdb_id
        LIMIT ?
      `).bind(e).all(),a=await t.DB.prepare("SELECT COUNT(*) as cnt FROM works WHERE media_type IS NULL OR media_type = ''").first();return new Response(JSON.stringify({ok:!0,items:r,remaining:a?.cnt||0}),{headers:s})}catch(e){return new Response(JSON.stringify({ok:!1,message:e.message}),{status:500,headers:s})}}if(d==="/admin/works/bulk-set-media-type"&&i.method==="POST"){if(!O(i,t))return new Response(JSON.stringify({ok:!1,message:"Unauthorized"}),{status:401,headers:s});try{let e=await i.json().catch(()=>({})),a=(Array.isArray(e.items)?e.items:[]).filter(m=>m&&m.tmdb_id&&(m.media_type==="movie"||m.media_type==="tv"));if(!a.length)return new Response(JSON.stringify({ok:!1,message:"\uC720\uD6A8\uD55C \uD56D\uBAA9\uC774 \uC5C6\uC5B4\uC694 (media_type\uC740 'movie' \uB610\uB294 'tv'\uB9CC \uD5C8\uC6A9)"}),{status:400,headers:s});let c=a.map(m=>t.DB.prepare("UPDATE works SET media_type = ? WHERE tmdb_id = ?").bind(m.media_type,parseInt(m.tmdb_id)));await t.DB.batch(c);let p=await t.DB.prepare("SELECT COUNT(*) as cnt FROM works WHERE media_type IS NULL OR media_type = ''").first();return new Response(JSON.stringify({ok:!0,updated:a.length,remaining:p?.cnt||0}),{headers:s})}catch(e){return new Response(JSON.stringify({ok:!1,message:e.message}),{status:500,headers:s})}}if(d==="/admin/grade-settings"&&i.method==="GET"){if(!O(i,t))return new Response(JSON.stringify({ok:!1,message:"Unauthorized"}),{status:401,headers:s});try{let{results:e}=await t.DB.prepare("SELECT * FROM grade_settings ORDER BY sort_order ASC").all();return new Response(JSON.stringify({ok:!0,data:e}),{headers:s})}catch(e){return new Response(JSON.stringify({ok:!1,message:e.message}),{status:500,headers:s})}}if(d==="/admin/grade-settings"&&i.method==="PUT"){if(!O(i,t))return new Response(JSON.stringify({ok:!1,message:"Unauthorized"}),{status:401,headers:s});try{let e=await i.json();if(!Array.isArray(e))return new Response(JSON.stringify({ok:!1,message:"Array required"}),{status:400,headers:s});for(let r of e)await t.DB.prepare(`
          INSERT INTO grade_settings
            (grade_key, grade_name, emoji_url, min_ott_points, is_special, sort_order)
          VALUES (?, ?, ?, ?, ?, ?)
          ON CONFLICT(grade_key) DO UPDATE SET
            grade_name     = excluded.grade_name,
            emoji_url      = excluded.emoji_url,
            min_ott_points = excluded.min_ott_points,
            is_special     = excluded.is_special,
            sort_order     = excluded.sort_order
        `).bind(r.grade_key,r.grade_name,r.emoji_url||"",r.min_ott_points||0,r.is_special?1:0,r.sort_order||0).run();return new Response(JSON.stringify({ok:!0}),{headers:s})}catch(e){return new Response(JSON.stringify({ok:!1,message:e.message}),{status:500,headers:s})}}if(d==="/admin/grade-settings/assign"&&i.method==="POST"){if(!O(i,t))return new Response(JSON.stringify({ok:!1,message:"Unauthorized"}),{status:401,headers:s});try{let{user_id:e,grade_key:r}=await i.json();return!e||!r?new Response(JSON.stringify({ok:!1,message:"user_id, grade_key required"}),{status:400,headers:s}):(await t.DB.prepare("UPDATE users SET grade = ? WHERE id = ?").bind(r,e).run(),new Response(JSON.stringify({ok:!0}),{headers:s}))}catch(e){return new Response(JSON.stringify({ok:!1,message:e.message}),{status:500,headers:s})}}if(d==="/admin/users"&&i.method==="GET"){if(!O(i,t))return new Response(JSON.stringify({ok:!1,message:"Unauthorized"}),{status:401,headers:s});try{let e=parseInt(f.searchParams.get("page")||"1"),r=50,a=(e-1)*r,c=f.searchParams.get("q")||"",p=`
        SELECT u.id, u.nickname, u.provider, u.grade, u.total_likes_received,
          u.created_at, u.last_login, u.ott_points,
          gs.grade_name, gs.emoji_url as grade_emoji_url,
          (SELECT COUNT(*) FROM reviews  WHERE user_id = u.id) as review_count,
          (SELECT COUNT(*) FROM wishlist WHERE user_id = u.id) as wishlist_count,
          (SELECT COUNT(*) FROM posts    WHERE user_id = u.id) as post_count
        FROM users u
        LEFT JOIN grade_settings gs ON gs.grade_key = u.grade
      `,m=[];c&&(p+=" WHERE u.nickname LIKE ?",m.push(`%${c}%`)),p+=" ORDER BY u.created_at DESC LIMIT ? OFFSET ?",m.push(r,a);let{results:_}=await t.DB.prepare(p).bind(...m).all();return new Response(JSON.stringify({ok:!0,data:_}),{headers:s})}catch(e){return new Response(JSON.stringify({ok:!1,message:e.message}),{status:500,headers:s})}}if(d==="/admin/ott-points/adjust"&&i.method==="POST"){if(!O(i,t))return new Response(JSON.stringify({ok:!1,message:"Unauthorized"}),{status:401,headers:s});try{let{user_id:e,points:r,reason:a}=await i.json();if(!e||r===void 0||!a)return new Response(JSON.stringify({ok:!1,message:"user_id, points, reason \uD544\uC218"}),{status:400,headers:s});await t.DB.prepare("INSERT INTO user_point_logs (user_id, points, reason) VALUES (?, ?, ?)").bind(e,r,a).run(),await t.DB.prepare("UPDATE users SET ott_points = MAX(0, COALESCE(ott_points, 0) + ?) WHERE id = ?").bind(r,e).run();let c=await t.DB.prepare("SELECT ott_points FROM users WHERE id = ?").bind(e).first();if(c){let p=await Rt(c.ott_points,t);p&&await t.DB.prepare("UPDATE users SET grade = ? WHERE id = ? AND (grade IS NULL OR grade NOT IN (SELECT grade_key FROM grade_settings WHERE is_special = 1))").bind(p,e).run()}return new Response(JSON.stringify({ok:!0}),{headers:s})}catch(e){return new Response(JSON.stringify({ok:!1,message:e.message}),{status:500,headers:s})}}return null}async function Rt(d,i){try{let{results:t}=await i.DB.prepare(`SELECT grade_key FROM grade_settings
       WHERE is_special = 0 AND min_ott_points <= ?
       ORDER BY min_ott_points DESC LIMIT 1`).bind(d).all();return t[0]?.grade_key||null}catch{return null}}async function it(d,i,t,f,s){let o=i.method;try{if(o==="GET"&&d==="/contents")return St(f,t,s);if(o==="GET"&&d==="/contents/pinned")return Ot(t,s);if(o==="GET"&&d==="/contents/list")return bt(f,t,s);let n=d.match(/^\/contents\/video\/(\d+)$/);if(o==="GET"&&n)return Nt(n[1],t,s);let l=d.match(/^\/contents\/comments\/(\d+)$/);if(o==="GET"&&l)return Tt(l[1],t,s);if(o==="POST"&&d==="/contents/comments")return Dt(i,t,s);let e=d.match(/^\/contents\/comments\/(\d+)$/);if(o==="DELETE"&&e)return ht(e[1],i,t,s);if(o==="PATCH"&&d==="/admin/contents/pinned/reorder")return Jt(i,t,s);if(o==="GET"&&d==="/admin/contents/check")return Lt(f,i,t,s);if(o==="GET"&&d==="/admin/contents")return At(f,i,t,s);if(o==="POST"&&d==="/admin/contents")return It(i,t,s);let r=d.match(/^\/admin\/contents\/(\d+)$/);if(o==="PUT"&&r)return Ct(r[1],i,t,s);let a=d.match(/^\/admin\/contents\/(\d+)$/);return o==="DELETE"&&a?Bt(a[1],i,t,s):null}catch(n){return console.error("[contents] \uC624\uB958:",n),new Response(JSON.stringify({ok:!1,error:"\uC11C\uBC84 \uC624\uB958\uAC00 \uBC1C\uC0DD\uD588\uC2B5\uB2C8\uB2E4."}),{status:500,headers:s})}}function A(d,i=200,t={}){return new Response(JSON.stringify(d),{status:i,headers:{"Content-Type":"application/json",...t}})}function U(d,i){return(d.headers.get("Authorization")||"").replace("Bearer ","").trim()===i.ADMIN_SECRET}async function rt(d,i,t,f,s){if(!d||!t)return;let o=await s.DB.prepare("SELECT media_type FROM works WHERE tmdb_id = ?").bind(d).first();if(!o){console.log(`[CONTENTS_LINK] tmdb_id=${d} works\uC5D0 \uC5C6\uC74C \u2014 title_videos \uBCF5\uC0AC \uC2A4\uD0B5`);return}if(!i||o.media_type!==i){console.log(`[CONTENTS_LINK] tmdb_id=${d} \uD0C0\uC785 \uBD88\uC77C\uCE58(works=${o.media_type}, ott_contents=${i}) \u2014 title_videos \uBCF5\uC0AC \uC2A4\uD0B5`);return}await s.DB.prepare(`
    INSERT OR IGNORE INTO title_videos (tmdb_id, youtube_url, youtube_id, title, is_main)
    VALUES (?, ?, ?, ?, 0)
  `).bind(d,`https://www.youtube.com/watch?v=${t}`,t,f||"").run(),console.log(`[CONTENTS_LINK] \u2705 tmdb_id=${d} youtube_id=${t} title_videos \uBCF5\uC0AC \uC644\uB8CC`)}async function St(d,i,t){let f=d.searchParams.get("platform"),s=d.searchParams.get("type"),o=Math.min(parseInt(d.searchParams.get("limit")||"20"),50),n=["is_hidden = 0"],l=[];f&&(n.push("platform = ?"),l.push(f)),s&&(n.push("type = ?"),l.push(s));let e=n.join(" AND ");l.push(o);let{results:r}=await i.DB.prepare(`SELECT id, youtube_id, platform, type, title, work_title,
            tmdb_id, tmdb_type, thumbnail, published_at, view_count, is_pinned
     FROM ott_contents
     WHERE ${e}
     ORDER BY published_at DESC
     LIMIT ?`).bind(...l).all();return A({ok:!0,items:r??[]},200,t)}async function Ot(d,i){let{results:t}=await d.DB.prepare(`SELECT id, youtube_id, platform, type, title, work_title,
            tmdb_id, tmdb_type, thumbnail, published_at, view_count,
            is_pinned, sort_order
     FROM ott_contents
     WHERE is_pinned = 1 AND is_hidden = 0
     ORDER BY sort_order ASC
     LIMIT 5`).all();return A({ok:!0,items:t??[]},200,i)}async function bt(d,i,t){let f=d.searchParams.get("platform"),s=d.searchParams.get("type"),o=Math.max(parseInt(d.searchParams.get("page")||"1"),1),n=30,l=(o-1)*n,e=["is_hidden = 0"],r=[];f&&(e.push("platform = ?"),r.push(f)),s&&(e.push("type = ?"),r.push(s));let a=e.join(" AND "),c=[...r],p=[...r,n,l],[m,_]=await i.DB.batch([i.DB.prepare(`SELECT COUNT(*) as total FROM ott_contents WHERE ${a}`).bind(...c),i.DB.prepare(`SELECT id, youtube_id, platform, type, title, work_title,
              tmdb_id, tmdb_type, thumbnail, published_at, view_count
       FROM ott_contents
       WHERE ${a}
       ORDER BY published_at DESC
       LIMIT ? OFFSET ?`).bind(...p)]),u=m.results?.[0]?.total??0,g=_.results??[];return A({ok:!0,items:g,pagination:{page:o,pageSize:n,total:u,totalPages:Math.ceil(u/n)}},200,t)}async function Nt(d,i,t){let f=await i.DB.prepare(`SELECT id, youtube_id, platform, type, title, work_title,
            tmdb_id, tmdb_type, thumbnail, published_at, view_count,
            is_pinned, created_at
     FROM ott_contents
     WHERE id = ? AND is_hidden = 0`).bind(d).first();return f?(i.DB.prepare("UPDATE ott_contents SET view_count = view_count + 1 WHERE id = ?").bind(d).run(),A({ok:!0,item:f},200,t)):A({ok:!1,error:"\uC601\uC0C1\uC744 \uCC3E\uC744 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4."},404,t)}async function Tt(d,i,t){let{results:f}=await i.DB.prepare(`SELECT c.id, c.body, c.created_at,
            u.id AS user_id,
            u.nickname,
            u.profile_image
     FROM ott_content_comments c
     JOIN users u ON c.user_id = u.id
     WHERE c.content_id = ? AND c.is_hidden = 0
     ORDER BY c.created_at ASC`).bind(d).all();return A({ok:!0,comments:f??[]},200,t)}async function Dt(d,i,t){let f=d.headers.get("Authorization")||"",s=f.startsWith("Bearer ")?f.slice(7).trim():null,o=h(d),n=s||o;if(!n)return A({ok:!1,error:"\uB85C\uADF8\uC778\uC774 \uD544\uC694\uD569\uB2C8\uB2E4."},401,t);let l=await i.DB.prepare(`SELECT s.user_id AS id, u.nickname
     FROM sessions s
     JOIN users u ON u.id = s.user_id
     WHERE s.id = ?
     LIMIT 1`).bind(n).first();if(!l)return A({ok:!1,error:"\uB85C\uADF8\uC778\uC774 \uD544\uC694\uD569\uB2C8\uB2E4."},401,t);let e;try{e=await d.json()}catch{return A({ok:!1,error:"\uC798\uBABB\uB41C \uC694\uCCAD \uD615\uC2DD\uC785\uB2C8\uB2E4."},400,t)}let{content_id:r,body:a}=e;if(!r||!a?.trim())return A({ok:!1,error:"content_id\uC640 \uB313\uAE00 \uB0B4\uC6A9\uC774 \uD544\uC694\uD569\uB2C8\uB2E4."},400,t);if(a.trim().length>500)return A({ok:!1,error:"\uB313\uAE00\uC740 500\uC790 \uC774\uB0B4\uB85C \uC785\uB825\uD574\uC8FC\uC138\uC694."},400,t);if(!await i.DB.prepare("SELECT id FROM ott_contents WHERE id = ? AND is_hidden = 0").bind(r).first())return A({ok:!1,error:"\uC601\uC0C1\uC744 \uCC3E\uC744 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4."},404,t);let p=await i.DB.prepare(`INSERT INTO ott_content_comments (content_id, user_id, body)
     VALUES (?, ?, ?)`).bind(r,l.id,a.trim()).run();return A({ok:!0,id:p.meta?.last_row_id},200,t)}async function ht(d,i,t,f){let s=i.headers.get("Authorization")||"",o=s.startsWith("Bearer ")?s.slice(7).trim():null,n=h(i),l=o||n;if(!l)return A({ok:!1,error:"\uB85C\uADF8\uC778\uC774 \uD544\uC694\uD569\uB2C8\uB2E4."},401,f);let e=await t.DB.prepare("SELECT s.user_id AS id FROM sessions s WHERE s.id = ? LIMIT 1").bind(l).first();if(!e)return A({ok:!1,error:"\uB85C\uADF8\uC778\uC774 \uD544\uC694\uD569\uB2C8\uB2E4."},401,f);let r=await t.DB.prepare("SELECT id, user_id FROM ott_content_comments WHERE id = ?").bind(d).first();return r?r.user_id!==e.id?A({ok:!1,error:"\uBCF8\uC778 \uB313\uAE00\uB9CC \uC0AD\uC81C\uD560 \uC218 \uC788\uC2B5\uB2C8\uB2E4."},403,f):(await t.DB.prepare("DELETE FROM ott_content_comments WHERE id = ?").bind(d).run(),A({ok:!0},200,f)):A({ok:!1,error:"\uB313\uAE00\uC744 \uCC3E\uC744 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4."},404,f)}async function At(d,i,t,f){if(!U(i,t))return A({ok:!1,error:"\uAD8C\uD55C\uC774 \uC5C6\uC2B5\uB2C8\uB2E4."},403,f);let s=d.searchParams.get("platform"),o=d.searchParams.get("type"),n=(d.searchParams.get("q")||"").trim(),l=Math.max(parseInt(d.searchParams.get("page")||"1"),1),e=50,r=(l-1)*e,a=["1=1"],c=[];if(s&&(a.push("platform = ?"),c.push(s)),o&&(a.push("type = ?"),c.push(o)),n){let w=n.replace(/\s+/g,"");a.push("(REPLACE(work_title, ' ', '') LIKE ? OR REPLACE(title, ' ', '') LIKE ?)"),c.push(`%${w}%`,`%${w}%`)}let p=a.join(" AND "),m=[...c],_=[...c,e,r],[u,g]=await t.DB.batch([t.DB.prepare(`SELECT COUNT(*) as total FROM ott_contents WHERE ${p}`).bind(...m),t.DB.prepare(`SELECT id, youtube_id, platform, type, title, work_title,
              tmdb_id, tmdb_type, thumbnail, published_at,
              view_count, is_pinned, is_hidden, sort_order, created_at
       FROM ott_contents
       WHERE ${p}
       ORDER BY published_at DESC
       LIMIT ? OFFSET ?`).bind(..._)]),k=u.results?.[0]?.total??0,E=g.results??[];return A({ok:!0,items:E,pagination:{page:l,pageSize:e,total:k,totalPages:Math.ceil(k/e)}},200,f)}async function Lt(d,i,t,f){if(!U(i,t))return A({ok:!1,error:"\uAD8C\uD55C\uC774 \uC5C6\uC2B5\uB2C8\uB2E4."},403,f);let s=d.searchParams.get("youtube_id");if(!s)return A({ok:!1,error:"youtube_id\uAC00 \uD544\uC694\uD569\uB2C8\uB2E4."},400,f);let o=await t.DB.prepare("SELECT id FROM ott_contents WHERE youtube_id = ?").bind(s).first();return A({ok:!0,exists:!!o},200,f)}async function It(d,i,t){if(!U(d,i))return A({ok:!1,error:"\uAD8C\uD55C\uC774 \uC5C6\uC2B5\uB2C8\uB2E4."},403,t);let f;try{f=await d.json()}catch{return A({ok:!1,error:"\uC798\uBABB\uB41C \uC694\uCCAD \uD615\uC2DD\uC785\uB2C8\uB2E4."},400,t)}let{youtube_id:s,platform:o,type:n="trailer",title:l,work_title:e,tmdb_id:r,tmdb_type:a,thumbnail:c,published_at:p}=f;if(!s||!o||!l||!p)return A({ok:!1,error:"youtube_id, platform, title, published_at\uB294 \uD544\uC218\uC785\uB2C8\uB2E4."},400,t);if(!["netflix","tving","disney","coupang","wavve","boxoffice","etc"].includes(o))return A({ok:!1,error:"\uC720\uD6A8\uD558\uC9C0 \uC54A\uC740 \uD50C\uB7AB\uD3FC\uC785\uB2C8\uB2E4."},400,t);if(!["trailer","teaser","preview","release"].includes(n))return A({ok:!1,error:"\uC720\uD6A8\uD558\uC9C0 \uC54A\uC740 \uD0C0\uC785\uC785\uB2C8\uB2E4."},400,t);try{let u=await i.DB.prepare(`INSERT INTO ott_contents
         (youtube_id, platform, type, title, work_title,
          tmdb_id, tmdb_type, thumbnail, published_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`).bind(s,o,n,l,e||null,r||null,a||null,c||null,p).run();if(r&&e)try{await i.DB.prepare(`INSERT OR IGNORE INTO works (tmdb_id, media_type, title_ko, match_source)
           VALUES (?, ?, ?, 'crawler')`).bind(r,a||null,e).run()}catch(g){console.error("[contents] works \uC790\uB3D9\uB4F1\uB85D \uC2E4\uD328(\uBB34\uC2DC):",g.message)}if(r)try{await rt(r,a||null,s,l,i)}catch(g){console.error("[contents] title_videos \uBCF5\uC0AC \uC2E4\uD328(\uBB34\uC2DC):",g.message)}return A({ok:!0,id:u.meta?.last_row_id},200,t)}catch(u){if(u.message?.includes("UNIQUE"))return A({ok:!1,error:"\uC774\uBBF8 \uB4F1\uB85D\uB41C YouTube \uC601\uC0C1\uC785\uB2C8\uB2E4."},409,t);throw u}}async function Ct(d,i,t,f){if(!U(i,t))return A({ok:!1,error:"\uAD8C\uD55C\uC774 \uC5C6\uC2B5\uB2C8\uB2E4."},403,f);let s;try{s=await i.json()}catch{return A({ok:!1,error:"\uC798\uBABB\uB41C \uC694\uCCAD \uD615\uC2DD\uC785\uB2C8\uB2E4."},400,f)}let o=await t.DB.prepare("SELECT id, youtube_id, title, tmdb_type FROM ott_contents WHERE id = ?").bind(d).first();if(!o)return A({ok:!1,error:"\uC601\uC0C1\uC744 \uCC3E\uC744 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4."},404,f);let n=["work_title","tmdb_id","tmdb_type","type","is_pinned","is_hidden","sort_order"],l=[],e=[];for(let r of n)s[r]!==void 0&&(l.push(`${r} = ?`),e.push(s[r]));if(l.length===0)return A({ok:!1,error:"\uC218\uC815\uD560 \uAC12\uC774 \uC5C6\uC2B5\uB2C8\uB2E4."},400,f);if(e.push(d),await t.DB.prepare(`UPDATE ott_contents SET ${l.join(", ")} WHERE id = ?`).bind(...e).run(),s.tmdb_id!==void 0)try{let r=s.tmdb_type!==void 0?s.tmdb_type:o.tmdb_type;await rt(s.tmdb_id,r,o.youtube_id,o.title,t)}catch(r){console.error("[contents] title_videos \uBCF5\uC0AC \uC2E4\uD328(\uBB34\uC2DC):",r.message)}return A({ok:!0},200,f)}async function Bt(d,i,t,f){return U(i,t)?await t.DB.prepare("SELECT id FROM ott_contents WHERE id = ?").bind(d).first()?(await t.DB.prepare("DELETE FROM ott_contents WHERE id = ?").bind(d).run(),A({ok:!0},200,f)):A({ok:!1,error:"\uC601\uC0C1\uC744 \uCC3E\uC744 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4."},404,f):A({ok:!1,error:"\uAD8C\uD55C\uC774 \uC5C6\uC2B5\uB2C8\uB2E4."},403,f)}async function Jt(d,i,t){if(!U(d,i))return A({ok:!1,error:"\uAD8C\uD55C\uC774 \uC5C6\uC2B5\uB2C8\uB2E4."},403,t);let f;try{f=await d.json()}catch{return A({ok:!1,error:"\uC798\uBABB\uB41C \uC694\uCCAD \uD615\uC2DD\uC785\uB2C8\uB2E4."},400,t)}let{ordered_ids:s}=f;if(!Array.isArray(s)||s.length===0)return A({ok:!1,error:"ordered_ids \uBC30\uC5F4\uC774 \uD544\uC694\uD569\uB2C8\uB2E4."},400,t);if(s.length>5)return A({ok:!1,error:"\uACE0\uC815 \uC601\uC0C1\uC740 \uCD5C\uB300 5\uAC1C\uC785\uB2C8\uB2E4."},400,t);let o=[i.DB.prepare("UPDATE ott_contents SET is_pinned = 0, sort_order = 0"),...s.map((n,l)=>i.DB.prepare("UPDATE ott_contents SET is_pinned = 1, sort_order = ? WHERE id = ?").bind(l+1,n))];return await i.DB.batch(o),A({ok:!0},200,t)}var ct="https://api.anthropic.com/v1/messages",at="https://ottrank.kr",P={netflix:"\uB137\uD50C\uB9AD\uC2A4",tving:"\uD2F0\uBE59",wavve:"\uC6E8\uC774\uBE0C",disney:"\uB514\uC988\uB2C8+",coupang:"\uCFE0\uD321\uD50C\uB808\uC774",boxoffice:"\uBC15\uC2A4\uC624\uD53C\uC2A4"},nt={friendly:`\uB124\uC774\uBC84 \uBE14\uB85C\uADF8 \uAC10\uC131 \uB9D0\uD22C. \uC9E7\uC740 \uC904\uBC14\uAFC8, \uBCF8\uC778 \uC598\uAE30\uB85C \uC2DC\uC791, \uB3C5\uC790\uC5D0\uAC8C \uB9D0 \uAC70\uB294 \uB290\uB08C.
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
- "\uC5B4\uB5A4 \uB4DC\uB77C\uB9C8\uB294 \uB05D\uB098\uACE0 \uB098\uC11C\uB3C4 \uD55C\uCC38\uC744 \uBA38\uB9BF\uC18D\uC5D0 \uB0A8\uC544\uC694. \uC774\uAC8C \uADF8\uB7F0 \uC791\uD488\uC785\uB2C8\uB2E4"`},ot={weekly_ranking:"\uC8FC\uAC04 TOP10 \uB7AD\uD0B9 \uD3EC\uC2A4\uD305\uC744 \uC791\uC131\uD574\uC8FC\uC138\uC694. \uC21C\uC704\uC640 \uD568\uAED8 \uAC01 \uC791\uD488\uC744 \uC18C\uAC1C\uD558\uACE0, \uC774\uBC88 \uC8FC \uD2B9\uD788 \uC8FC\uBAA9\uD560 \uC791\uD488\uC744 \uAC15\uC870\uD574\uC8FC\uC138\uC694.",recommendation:"\uC9C0\uAE08 \uB2F9\uC7A5 \uBD10\uC57C \uD560 \uCD94\uCC9C \uC791\uD488 \uBAA8\uC74C \uD3EC\uC2A4\uD305\uC744 \uC791\uC131\uD574\uC8FC\uC138\uC694. \uAC01 \uC791\uD488\uC758 \uB9E4\uB825 \uD3EC\uC778\uD2B8\uC640 \uCD94\uCC9C \uC774\uC720\uB97C \uAD6C\uCCB4\uC801\uC73C\uB85C \uAC15\uC870\uD574\uC8FC\uC138\uC694.",genre:"\uC7A5\uB974\uBCC4\uB85C \uC791\uD488\uC744 \uBD84\uB958\uD558\uACE0, \uC5B4\uB5A4 \uCDE8\uD5A5\uC758 \uC0AC\uB78C\uC5D0\uAC8C \uC5B4\uC6B8\uB9AC\uB294\uC9C0 \uC124\uBA85\uC744 \uD3EC\uD568\uD55C \uCD94\uCC9C \uD3EC\uC2A4\uD305\uC744 \uC791\uC131\uD574\uC8FC\uC138\uC694.",review:"\uC0C1\uC704 3~5\uAC1C \uC791\uD488\uC5D0 \uC9D1\uC911\uD574\uC11C \uC904\uAC70\uB9AC, \uBCFC\uAC70\uB9AC, \uCD94\uCC9C \uD3EC\uC778\uD2B8\uB97C \uB2F4\uC740 \uBBF8\uB2C8 \uB9AC\uBDF0 \uD615\uD0DC\uC758 \uD3EC\uC2A4\uD305\uC744 \uC791\uC131\uD574\uC8FC\uC138\uC694."},dt={ranking:{label:"\uC21C\uC704\uD615",examples:["{platform} {media} \uC21C\uC704 TOP 10 ({week} \uC5C5\uB370\uC774\uD2B8)","\uC694\uC998 {platform} \uC21C\uC704 {media} TOP 10 \uACE8\uB77C\uBD04","{week} {platform} \uC21C\uC704 {media} \uC815\uB9AC","{platform} \uC624\uB298 \uC21C\uC704 TOP 10 {media} (\uCD5C\uC2E0)"],rule:`1. "{platform} + \uC21C\uC704 + TOP N \uB610\uB294 \uB0A0\uC9DC" \uC870\uD569 \uD544\uC218
2. \uC2E4\uC81C \uB7AD\uD0B9 1~3\uC704 \uC791\uD488\uBA85\uC744 \uC81C\uBAA9\uC5D0 \uC9C1\uC811 \uD65C\uC6A9 (\uAC80\uC0C9\uB7C9 \uADF9\uB300\uD654)
3. \uB0A0\uC9DC/\uC8FC\uCC28 \uD45C\uAE30\uB85C \uCD5C\uC2E0\uC131 \uAC15\uC870 (\uC608: {week}, 2026 \uCD5C\uC2E0)`},recommendation:{label:"\uCD94\uCC9C\uD615",examples:["\uC9C0\uAE08 \uB2F9\uC7A5 \uBD10\uC57C \uD560 {platform} \uCD94\uCC9C {media} BEST 5","{platform} \uBCFC\uB9CC\uD55C\uAC70 \uC5C6\uC744 \uB54C \uCD94\uCC9C {media} TOP 7","\uC694\uC998 \uD56B\uD55C {platform} {media} \uCD94\uCC9C 2026 \uCD5C\uC2E0\uD310","{platform} {media} \uCD94\uCC9C \uC7A5\uB974\uBCC4 \uBAA8\uC74C (\uB85C\uB9E8\uC2A4\xB7\uC2A4\uB9B4\uB7EC\xB7\uBC94\uC8C4)"],rule:`1. "\uC9C0\uAE08 \uBD10\uC57C \uD560", "\uCD94\uCC9C", "BEST", "\uAC15\uCD94" \uB4F1 \uD050\uB808\uC774\uC158 \uD0A4\uC6CC\uB4DC \uD544\uC218
2. TOP N \uC22B\uC790\uB294 \uC120\uD0DD\uC801\uC73C\uB85C\uB9CC \uC0AC\uC6A9 \u2014 \uC21C\uC704 \uB098\uC5F4\uD615 \uC81C\uBAA9\uC73C\uB85C \uD750\uB974\uC9C0 \uB9D0 \uAC83
3. \uC7A5\uB974\xB7\uCDE8\uD5A5 \uAE30\uBC18 \uD45C\uD604\uC744 \uC801\uADF9 \uD65C\uC6A9`},review:{label:"\uB9AC\uBDF0\uD615",examples:["{platform} 1\uC704 [\uC791\uD488\uBA85] \uC194\uC9C1 \uD6C4\uAE30 \uC7AC\uBC0C\uC5B4? \uACB0\uB9D0\uAE4C\uC9C0","[\uC791\uD488\uBA85] {platform} {media} \uC644\uC8FC \uD6C4\uAE30 (\uC2A4\uD3EC\uC5C6\uC74C)","{platform} [\uC791\uD488\uBA85] \uC815\uC8FC\uD589 \uC644\uB8CC \uBCC4\uC810 \uBA87 \uC810?"],rule:`1. \uB7AD\uD0B9 1\uC704 \uC791\uD488 \uD558\uB098\uC5D0 \uC9D1\uC911\uD55C \uB2E8\uC77C \uC791\uD488 \uB9AC\uBDF0 \uC81C\uBAA9
2. "\uD6C4\uAE30", "\uC194\uC9C1 \uB9AC\uBDF0", "\uACB0\uB9D0", "\uC815\uC8FC\uD589" \uB4F1 \uAC10\uC0C1 \uD0A4\uC6CC\uB4DC \uD544\uC218
3. TOP N \uC21C\uC704 \uB098\uC5F4\uD615 \uC81C\uBAA9\uC740 \uC808\uB300 \uC0AC\uC6A9\uD558\uC9C0 \uB9D0 \uAC83`},issue:{label:"\uD654\uC81C\uD615",examples:["{platform} {media} \uD654\uC81C\uC791 \uC774\uBC88 \uC8FC \uB193\uCE58\uBA74 \uD6C4\uD68C TOP 5","2026 \uC0C1\uBC18\uAE30 {platform} {media} \uD765\uD589 \uC21C\uC704 \uC815\uB9AC","{platform} [\uC791\uD488\uBA85] \uC2DC\uC98C2 \uAE30\uB300\uB418\uB294 \uC774\uC720"],rule:`1. "\uD654\uC81C", "\uC774\uC288", "\uD765\uD589", "\uB17C\uB780", "\uC2DC\uC98C2 \uAE30\uB300" \uB4F1 \uD654\uC81C\uC131 \uD0A4\uC6CC\uB4DC \uD544\uC218
2. \uB2E8\uC21C \uC21C\uC704 \uB098\uC5F4\uD615(TOP N) \uC81C\uBAA9\uC740 \uC9C0\uC591\uD558\uACE0 \uD654\uC81C\uC131\uC5D0 \uC9D1\uC911`}};async function z(d,i,t=null){let f=t?`SELECT category_slot, display_name, platform_limit, source_name
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
       ORDER BY platform_order ASC`,s=t?await i.DB.prepare(f).bind(d,t).all():await i.DB.prepare(f).bind(d).all();if(!s.results||s.results.length===0)return[];let o=[];for(let n of s.results){let l=n.platform_limit||10,e=await i.DB.prepare(`SELECT
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
       LIMIT ?`).bind(d,n.category_slot,d,n.category_slot,l).all();e.results&&e.results.length>0&&o.push({category_slot:n.category_slot,display_name:n.display_name,source_name:n.source_name||"",items:e.results})}return o}function Mt(d,i){let f=`[${P[i]||i} \uD604\uC7AC \uB7AD\uD0B9 \uB370\uC774\uD130]

`;return d.forEach(s=>{!s.items||s.items.length===0||(f+=`## ${s.display_name}
`,s.items.forEach((o,n)=>{let l=o.title_ko||o.title_en||"\uC81C\uBAA9 \uC5C6\uC74C",e=o.tmdb_rating?` (\uC624\uB728\uB791 \uD3C9\uC810: ${o.tmdb_rating})`:"",r=o.release_year?` [${o.release_year}\uB144]`:"",a=o.genre?` | \uC7A5\uB974: ${o.genre}`:"";f+=`${n+1}\uC704. ${l}${r}${e}${a}
`}),f+=`
`)}),f}function lt(){let d=new Date,i=d.getFullYear(),t=d.getMonth()+1,f=Math.ceil(d.getDate()/7);return`${i}\uB144 ${t}\uC6D4 ${f}\uC8FC\uCC28`}async function Ht(d,i,{useWebSearch:t=!0,maxTokens:f=4096}={}){let s={model:"claude-sonnet-4-6",max_tokens:f,messages:[{role:"user",content:d}]};t&&(s.tools=[{type:"web_search_20250305",name:"web_search",max_uses:5}]);let o=await fetch(ct,{method:"POST",headers:{"Content-Type":"application/json","x-api-key":i,"anthropic-version":"2023-06-01"},body:JSON.stringify(s)});if(!o.ok){let l=await o.json().catch(()=>({}));throw new Error(l.error?.message||`Anthropic API \uC624\uB958: ${o.status}`)}return((await o.json()).content||[]).filter(l=>l.type==="text").map(l=>l.text).join(`
`)}async function mt(d,i,t,f,s){if(i.method==="GET"&&d==="/blog-gen/image"){let o=f.searchParams.get("path")||"",n=f.searchParams.get("size")||"w780";if(!o)return new Response(JSON.stringify({ok:!1,error:"path \uD30C\uB77C\uBBF8\uD130 \uD544\uC694"}),{status:400,headers:s});try{let l=`https://image.tmdb.org/t/p/${n}${o}`,e=await fetch(l);if(!e.ok)throw new Error(`\uC774\uBBF8\uC9C0 \uB85C\uB4DC \uC2E4\uD328: ${e.status}`);let r=await e.arrayBuffer(),a=e.headers.get("content-type")||"image/jpeg";return new Response(r,{status:200,headers:{"Content-Type":a,"Access-Control-Allow-Origin":s["Access-Control-Allow-Origin"],"Cache-Control":"public, max-age=86400"}})}catch(l){return new Response(JSON.stringify({ok:!1,error:l.message}),{status:500,headers:s})}}if(i.method==="GET"&&d==="/blog-gen/preview"){if(!O(i,t))return new Response(JSON.stringify({ok:!1,error:"Unauthorized"}),{status:401,headers:s});let o=f.searchParams.get("platform")||"netflix",n=f.searchParams.get("categorySlot")||null;if(!P[o])return new Response(JSON.stringify({ok:!1,error:"\uC9C0\uC6D0\uD558\uC9C0 \uC54A\uB294 \uD50C\uB7AB\uD3FC\uC785\uB2C8\uB2E4."}),{status:400,headers:s});try{let l=await z(o,t,n);return new Response(JSON.stringify({ok:!0,data:l}),{headers:s})}catch(l){return new Response(JSON.stringify({ok:!1,error:l.message}),{status:500,headers:s})}}if(i.method==="POST"&&d==="/blog-gen/suggest"){if(!O(i,t))return new Response(JSON.stringify({ok:!1,error:"Unauthorized"}),{status:401,headers:s});let o=t.ANTHROPIC_API_KEY;if(!o)return new Response(JSON.stringify({ok:!1,error:"ANTHROPIC_API_KEY \uD658\uACBD \uBCC0\uC218\uAC00 \uC124\uC815\uB418\uC9C0 \uC54A\uC558\uC2B5\uB2C8\uB2E4."}),{status:500,headers:s});let n;try{n=await i.json()}catch{return new Response(JSON.stringify({ok:!1,error:"\uC798\uBABB\uB41C \uC694\uCCAD \uD615\uC2DD\uC785\uB2C8\uB2E4."}),{status:400,headers:s})}let{platform:l="netflix",topicType:e="ranking",categorySlot:r="all"}=n;try{let a=[],c=l==="all"?["netflix","tving"]:[l],p=l!=="all"&&r&&r!=="all"?r:null;for(let T of c){if(T!=="all"&&!P[T])continue;let L=await z(T,t,p);a.push(...L)}let m="";a.length>0?m=a.map(T=>`[${T.display_name}]
`+(T.items||[]).slice(0,5).map((L,C)=>{let I=L.title_ko||L.title_en||"\uC81C\uBAA9 \uC5C6\uC74C",B=L.genre?` (${L.genre.split(",")[0]})`:"",J=L.tmdb_rating?` \u2605${parseFloat(L.tmdb_rating).toFixed(1)}`:"";return`  ${C+1}\uC704. ${I}${B}${J}`}).join(`
`)).join(`

`):m="\uD604\uC7AC \uB7AD\uD0B9 \uB370\uC774\uD130 \uC5C6\uC74C. OTT \uC778\uAE30 \uCF58\uD150\uCE20 \uC77C\uBC18 \uD2B8\uB80C\uB4DC \uAE30\uBC18\uC73C\uB85C \uCD94\uCC9C\uD574\uC8FC\uC138\uC694.";let _=l==="all"?"\uB137\uD50C\uB9AD\uC2A4\xB7\uD2F0\uBE59":P[l]||l,u=lt(),g=(()=>{if(a.length===1){let T=a[0].display_name||"";if(T.includes("\uC601\uD654"))return"\uC601\uD654";if(T.includes("\uB4DC\uB77C\uB9C8")||T.includes("TV")||T.includes("\uC2DC\uB9AC\uC988"))return"\uB4DC\uB77C\uB9C8"}return"\uB4DC\uB77C\uB9C8\xB7\uC601\uD654"})(),k=dt[e]||dt.ranking,E=k.examples.map(T=>"- "+T.replace(/{platform}/g,_).replace(/{media}/g,g).replace(/{week}/g,u)).join(`
`),w=k.rule.replace(/{platform}/g,_).replace(/{week}/g,u),y=`\uB2F9\uC2E0\uC740 \uB124\uC774\uBC84 \uBE14\uB85C\uADF8 SEO \uC804\uBB38\uAC00\uC785\uB2C8\uB2E4.
\uC544\uB798\uB294 \uB124\uC774\uBC84\uC5D0\uC11C \uC2E4\uC81C\uB85C \uC0C1\uC704 \uB178\uCD9C\uB418\uB294 OTT \uBE14\uB85C\uADF8 \uC81C\uBAA9 \uD328\uD134 \uC911 "${k.label}" \uC720\uD615 \uC608\uC2DC\uC785\uB2C8\uB2E4.
\uC774\uBC88 \uCD94\uCC9C\uC740 \uBC18\uB4DC\uC2DC "${k.label}" \uC2A4\uD0C0\uC77C\uB85C\uB9CC \uC791\uC131\uD558\uACE0, \uB2E4\uB978 \uC720\uD615\uACFC \uC11E\uC9C0 \uB9C8\uC138\uC694.

[${k.label} \uD328\uD134 \uC608\uC2DC]
${E}

\uD604\uC7AC \uB7AD\uD0B9 \uB370\uC774\uD130:
\uD50C\uB7AB\uD3FC: ${_} / \uAE30\uAC04: ${u}

${m}

\uC704 \uB370\uC774\uD130\uC5D0 \uC5C6\uB294 \uC8FC\uC81C(\uC608: \uB2E4\uC74C \uB2EC \uACF5\uAC1C \uC608\uC815 \uC2E0\uC791, \uC774\uBC88 \uBD84\uAE30\xB7\uBC18\uAE30 \uACB0\uC0B0, \uC544\uC9C1 \uB7AD\uD0B9\uC5D0 \uC548 \uC7A1\uD78C
\uCD5C\uC2E0 \uD654\uC81C\uC791\xB7\uC774\uC288 \uB4F1)\uB97C \uB2E4\uB904\uC57C \uD55C\uB2E4\uBA74, web_search\uB97C \uC5EC\uB7EC \uBC88 \uC0AC\uC6A9\uD574\uC11C \uC5B8\uB860 \uBCF4\uB3C4\xB7\uD654\uC81C\uC131\xB7
\uACF5\uAC1C \uC2DC\uAE30\xB7\uC2DC\uC98C \uAC31\uC2E0 \uC5EC\uBD80 \uAC19\uC740 \uB2E8\uC11C\uB4E4\uC744 \uCDA9\uBD84\uD788 \uBAA8\uC740 \uB4A4, \uADF8\uAC78 \uADFC\uAC70\uB85C \uC21C\uC704\xB7\uCD94\uCC9C \uB9AC\uC2A4\uD2B8\uB97C
\uB2F9\uB2F9\uD558\uAC8C \uB9CC\uB4E4\uC5B4\uB0B4\uC138\uC694. "\uC815\uD655\uD55C \uACF5\uC2DD \uC218\uCE58\uAC00 \uC5C6\uB2E4"\uB294 \uC2DD\uC73C\uB85C \uBC1C\uBE8C\uD558\uAC70\uB098 \uC560\uB9E4\uD558\uAC8C \uC5BC\uBC84\uBB34\uB9AC\uC9C0
\uB9D0\uACE0, \uC2E4\uC81C OTT \uBE14\uB85C\uAC70\uAC00 \uC4F0\uB4EF \uC790\uC5F0\uC2A4\uB7FD\uAC8C \uB2E8\uC815\uD574\uC11C \uC4F0\uC138\uC694. \uB2E8, \uAC80\uC0C9 \uACB0\uACFC \uBB38\uC7A5\uC744 \uADF8\uB300\uB85C
\uBCA0\uB07C\uC9C0 \uB9D0\uACE0 \uC9C1\uC811 \uC0C8\uB85C \uD45C\uD604\uD574\uC57C \uD569\uB2C8\uB2E4.

\uC81C\uBAA9 \uC0DD\uC131 \uC870\uAC74:
${w}
4. 15~35\uC790 \uD55C\uAD6D\uC5B4, \uD2B9\uC218\uAE30\uD638 \uCD5C\uC18C\uD654
5. 8\uAC1C \uBAA8\uB450 \uC704 "${k.label}" \uD328\uD134 \uC2A4\uD0C0\uC77C\uC744 \uC720\uC9C0\uD558\uB418 \uD45C\uD604\uC740 \uB2E4\uC591\uD558\uAC8C \uBCC0\uC8FC
6. contentType: weekly_ranking / recommendation / genre / review \uC911 \uC120\uD0DD

\uB2E4\uB978 \uC124\uBA85, \uAC80\uC0C9 \uACFC\uC815 \uC124\uBA85, \uCD9C\uCC98 \uD45C\uAE30 \uC5C6\uC774 \uC544\uB798 JSON \uBC30\uC5F4 \uD615\uC2DD\uC73C\uB85C\uB9CC \uC751\uB2F5\uD558\uC138\uC694.
\uB9C8\uD06C\uB2E4\uC6B4 \uCF54\uB4DC\uBE14\uB85D(\`\`\`) \uC5C6\uC774 \uC21C\uC218 JSON\uB9CC \uBC18\uD658\uD569\uB2C8\uB2E4:
[
  {
    "title": "\uBE14\uB85C\uADF8 \uC81C\uBAA9",
    "topic": "\uD55C \uC904 \uC8FC\uC81C \uC124\uBA85 (20\uC790 \uC774\uB0B4)",
    "contentType": "weekly_ranking"
  }
]`,b=await fetch(ct,{method:"POST",headers:{"Content-Type":"application/json","x-api-key":o,"anthropic-version":"2023-06-01"},body:JSON.stringify({model:"claude-haiku-4-5-20251001",max_tokens:1500,messages:[{role:"user",content:y}],tools:[{type:"web_search_20250305",name:"web_search",max_uses:3}]})});if(!b.ok){let T=await b.json().catch(()=>({}));throw new Error(T.error?.message||`Anthropic API \uC624\uB958: ${b.status}`)}let D=(((await b.json()).content||[]).filter(T=>T.type==="text").map(T=>T.text).join("").trim()||"[]").replace(/^```json\s*/i,"").replace(/^```\s*/,"").replace(/\s*```$/,"").trim(),S;try{S=JSON.parse(D)}catch{let T=D.match(/\[[\s\S]*\]/);if(T)try{S=JSON.parse(T[0])}catch{}}if(!S)throw new Error("AI \uC751\uB2F5\uC744 JSON\uC73C\uB85C \uD30C\uC2F1\uD560 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4. \uB2E4\uC2DC \uC2DC\uB3C4\uD574\uC8FC\uC138\uC694.");if(!Array.isArray(S))throw new Error("AI \uC751\uB2F5\uC774 \uBC30\uC5F4 \uD615\uC2DD\uC774 \uC544\uB2D9\uB2C8\uB2E4.");return S=S.filter(T=>T&&typeof T.title=="string"&&T.title.trim()).map(T=>({title:T.title.trim(),topic:T.topic?.trim()||"",contentType:T.contentType?.trim()||"weekly_ranking"})).slice(0,8),new Response(JSON.stringify({ok:!0,suggestions:S,rankingData:a,meta:{platform:_,weekLabel:u,topicType:e,categorySlot:p||"all",categoryLabel:p&&a.length===1?a[0].display_name:"\uC804\uCCB4",generatedAt:new Date().toISOString()}}),{headers:s})}catch(a){return new Response(JSON.stringify({ok:!1,error:a.message}),{status:500,headers:s})}}if(i.method==="POST"&&d==="/blog-gen"){if(!O(i,t))return new Response(JSON.stringify({ok:!1,error:"Unauthorized"}),{status:401,headers:s});let o=t.ANTHROPIC_API_KEY;if(!o)return new Response(JSON.stringify({ok:!1,error:"ANTHROPIC_API_KEY \uD658\uACBD \uBCC0\uC218\uAC00 \uC124\uC815\uB418\uC9C0 \uC54A\uC558\uC2B5\uB2C8\uB2E4. Cloudflare Workers \u2192 Settings \u2192 Variables and Secrets\uC5D0\uC11C \uB4F1\uB85D\uD574\uC8FC\uC138\uC694."}),{status:500,headers:s});let n;try{n=await i.json()}catch{return new Response(JSON.stringify({ok:!1,error:"\uC798\uBABB\uB41C \uC694\uCCAD \uD615\uC2DD\uC785\uB2C8\uB2E4."}),{status:400,headers:s})}let{platform:l="netflix",contentType:e="weekly_ranking",categorySlot:r="all",tone:a="friendly",useEmoji:c=!0,useRating:p=!0,useLink:m=!0,useSpoiler:_=!1,useHashtag:u=!0,extraRequest:g=""}=n;if(!P[l])return new Response(JSON.stringify({ok:!1,error:"\uC9C0\uC6D0\uD558\uC9C0 \uC54A\uB294 \uD50C\uB7AB\uD3FC\uC785\uB2C8\uB2E4."}),{status:400,headers:s});let k=r&&r!=="all"?r:null;try{let E=await z(l,t,k);if(E.length===0)return new Response(JSON.stringify({ok:!1,error:k?"\uC120\uD0DD\uD55C \uCE74\uD14C\uACE0\uB9AC\uC758 \uB7AD\uD0B9 \uB370\uC774\uD130\uAC00 \uC5C6\uC2B5\uB2C8\uB2E4. \uB2E4\uB978 \uCE74\uD14C\uACE0\uB9AC\uB97C \uC120\uD0DD\uD558\uAC70\uB098 '\uC804\uCCB4'\uB85C \uB2E4\uC2DC \uC2DC\uB3C4\uD574\uC8FC\uC138\uC694.":"\uB7AD\uD0B9 \uB370\uC774\uD130\uAC00 \uC5C6\uC2B5\uB2C8\uB2E4. \uD06C\uB864\uB9C1 \uC644\uB8CC \uD6C4 \uB2E4\uC2DC \uC2DC\uB3C4\uD558\uAC70\uB098, \uD398\uC774\uC9C0 \uCE74\uD14C\uACE0\uB9AC \uC124\uC815\uC5D0\uC11C OTT \uD398\uC774\uC9C0 \uB178\uCD9C \uC5EC\uBD80\uB97C \uD655\uC778\uD574\uC8FC\uC138\uC694."}),{status:404,headers:s});let w=Mt(E,l),y=lt(),b=P[l],N=E.length===1&&(E[0].display_name||"").includes("\uC601\uD654")?"\uC601\uD654":"\uB4DC\uB77C\uB9C8",R=!!(g&&g.trim()),D=R?g.trim():`${y} ${b} \u2014 ${ot[e]||ot.weekly_ranking}`,S=[];c||S.push("\uC774\uBAA8\uC9C0\uB97C \uC0AC\uC6A9\uD558\uC9C0 \uB9C8\uC138\uC694."),p&&S.push(`\uC624\uB728\uB791(${at}) \uD3C9\uC810 \uC815\uBCF4\uB97C \uC790\uC5F0\uC2A4\uB7FD\uAC8C \uC5B8\uAE09\uD574\uC8FC\uC138\uC694.`),m&&S.push(`\uD3EC\uC2A4\uD305 \uC911\uAC04\uC774\uB098 \uB9C8\uC9C0\uB9C9\uC5D0 "${at}" \uB9C1\uD06C\uB97C "\uC624\uB728\uB791\uC5D0\uC11C \uB354 \uBCF4\uAE30" \uD615\uD0DC\uB85C \uC790\uC5F0\uC2A4\uB7FD\uAC8C \uC0BD\uC785\uD574\uC8FC\uC138\uC694.`),_&&S.push("\uC2A4\uD3EC\uC77C\uB7EC \uC8FC\uC758 \uBB38\uAD6C\uAC00 \uD544\uC694\uD55C \uC791\uD488\uC5D0\uB294 \u26A0\uFE0F \uC2A4\uD3EC\uC8FC\uC758 \uB77C\uBCA8\uC744 \uB2EC\uC544\uC8FC\uC138\uC694."),u&&S.push(`\uD3EC\uC2A4\uD305 \uB9C8\uC9C0\uB9C9\uC5D0 \uB124\uC774\uBC84 \uBE14\uB85C\uADF8\uC6A9 \uD574\uC2DC\uD0DC\uADF8\uB97C 15\uAC1C \uC774\uC0C1 \uCD94\uAC00\uD574\uC8FC\uC138\uC694. (\uC608: #${b}${N}\uCD94\uCC9C #OTT\uCD94\uCC9C #${b}\uC21C\uC704 \uB4F1)`);let T=`\uB2F9\uC2E0\uC740 \uB124\uC774\uBC84 \uBE14\uB85C\uADF8\uC5D0 OTT \uCF58\uD150\uCE20 \uAE00\uC744 \uB9E4\uC77C \uC4F0\uB294 30\uB300 \uC9C1\uC7A5\uC778\uC785\uB2C8\uB2E4.
\uB4DC\uB77C\uB9C8\uB97C \uC9C4\uC9DC \uC88B\uC544\uD574\uC11C \uD1F4\uADFC \uD6C4\uC5D0 \uBCF4\uACE0, \uC8FC\uB9D0\uC5D0 \uBAB0\uC544\uBCF4\uACE0, \uB290\uB080 \uB300\uB85C \uC194\uC9C1\uD558\uAC8C \uC501\uB2C8\uB2E4.
${R?`\uC624\uB298 \uC4F8 \uAE00\uC758 \uC8FC\uC81C\uB294 \uC815\uD655\uD788 \uC774\uAC81\uB2C8\uB2E4: "${D}"
\uC774 \uC8FC\uC81C\uC5D0 \uB9DE\uAC8C \uAE00\uC744 \uC791\uC131\uD574\uC8FC\uC138\uC694. \uC544\uB798 \uB7AD\uD0B9 \uB370\uC774\uD130\uB294 \uCC38\uACE0\uC6A9 \uBCF4\uC870\uC790\uB8CC\uC77C \uBFD0\uC785\uB2C8\uB2E4 \u2014
\uC8FC\uC81C\uC640 \uC9C1\uC811 \uAD00\uB828\uB41C \uBD80\uBD84\uB9CC \uCC38\uACE0\uD558\uACE0, \uAD00\uB828 \uC5C6\uC73C\uBA74 \uBB34\uC2DC\uD558\uC138\uC694.`:"\uC544\uB798 \uB7AD\uD0B9 \uB370\uC774\uD130\uB97C \uBC14\uD0D5\uC73C\uB85C \uC9C0\uAE08 \uB2F9\uC7A5 \uC774 \uC0AC\uB78C\uC774 \uC4F8 \uAC83 \uAC19\uC740 \uBE14\uB85C\uADF8 \uAE00\uC744 \uC791\uC131\uD574\uC8FC\uC138\uC694."}

${w}

${R?`\uC8FC\uC81C("${D}")\uAC00 \uC704 \uB370\uC774\uD130\uB9CC\uC73C\uB85C\uB294 \uBD80\uC871\uD560 \uAC00\uB2A5\uC131\uC774 \uB192\uC2B5\uB2C8\uB2E4 \u2014 \uADF8\uB7F0 \uACBD\uC6B0
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
\uC8FC\uC81C: ${D}
\uB9D0\uD22C: ${nt[a]||nt.friendly}
\uAE38\uC774: 1500\uC790~2500\uC790
\uAD6C\uC870: [\uC81C\uBAA9] \u2192 \uB3C4\uC785\uBD80 \u2192 \uBCF8\uBB38 \u2192 \uB9C8\uBB34\uB9AC
${e==="weekly_ranking"?E.length>1?"\uC21C\uC704 \uB098\uC5F4: \uCE74\uD14C\uACE0\uB9AC\uBCC4\uB85C \uC139\uC158\uC744 \uB098\uB220\uC11C \uAC01\uAC01 10\uC704\u21921\uC704 \uC5ED\uC21C\uC73C\uB85C \uC791\uC131 (\uC11C\uB85C \uB2E4\uB978 \uCE74\uD14C\uACE0\uB9AC\uB97C \uD558\uB098\uC758 \uC21C\uC704 \uB9AC\uC2A4\uD2B8\uB85C \uD569\uCE58\uC9C0 \uB9D0 \uAC83)":"\uC21C\uC704 \uB098\uC5F4: 10\uC704\u21921\uC704 \uC5ED\uC21C (\uB05D\uAE4C\uC9C0 \uC77D\uAC8C \uC720\uB3C4)":""}

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

${S.length>0?`[\uCD94\uAC00 \uC9C0\uC2DC\uC0AC\uD56D]
`+S.map((C,I)=>`${I+1}. ${C}`).join(`
`):""}

\uB9C8\uD06C\uB2E4\uC6B4 \uAE30\uD638 \uC5C6\uC774 \uC77C\uBC18 \uD14D\uC2A4\uD2B8\uB85C, \uB2E8\uB77D \uAD6C\uBD84\uC740 \uBE48 \uC904\uB85C\uB9CC \uD574\uC8FC\uC138\uC694.`,L=await Ht(T,o,{useWebSearch:R,maxTokens:R?5e3:4096});if(!L)throw new Error("AI \uC751\uB2F5\uC774 \uBE44\uC5B4\uC788\uC2B5\uB2C8\uB2E4. \uB2E4\uC2DC \uC2DC\uB3C4\uD574\uC8FC\uC138\uC694.");return new Response(JSON.stringify({ok:!0,post:L,rankingData:E,meta:{platform:l,platformName:b,weekInfo:y,categorySlot:k||"all",categoryLabel:k&&E.length===1?E[0].display_name:"\uC804\uCCB4",generatedAt:new Date().toISOString()}}),{headers:s})}catch(E){return new Response(JSON.stringify({ok:!1,error:E.message}),{status:500,headers:s})}}return null}var Ft=["ad","bug"],Wt=["pending","answered","resolved"],Ut=5,pt=30;async function _t(d,i,t,f,s,o){if(d==="/inquiry"&&i.method==="POST")try{let e=await i.json(),{type:r,name:a,email:c,phone:p,title:m,content:_,page_url:u,website:g}=e;if(g)return new Response(JSON.stringify({ok:!0}),{headers:o});if(!Ft.includes(r))return new Response(JSON.stringify({ok:!1,message:"type\uC740 ad \uB610\uB294 bug\uC5EC\uC57C \uD569\uB2C8\uB2E4"}),{status:400,headers:o});if(!m||!m.trim()||!_||!_.trim())return new Response(JSON.stringify({ok:!1,message:"\uC81C\uBAA9\uACFC \uB0B4\uC6A9\uC740 \uD544\uC218\uC785\uB2C8\uB2E4"}),{status:400,headers:o});if(r==="ad"){if(!a||!a.trim())return new Response(JSON.stringify({ok:!1,message:"\uB2F4\uB2F9\uC790\uBA85 \uB610\uB294 \uC5C5\uCCB4\uBA85\uC744 \uC785\uB825\uD574\uC8FC\uC138\uC694"}),{status:400,headers:o});if(!c||!c.trim())return new Response(JSON.stringify({ok:!1,message:"\uC774\uBA54\uC77C\uC744 \uC785\uB825\uD574\uC8FC\uC138\uC694"}),{status:400,headers:o})}if(c&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(c))return new Response(JSON.stringify({ok:!1,message:"\uC774\uBA54\uC77C \uD615\uC2DD\uC774 \uC62C\uBC14\uB974\uC9C0 \uC54A\uC2B5\uB2C8\uB2E4"}),{status:400,headers:o});let k=r,E=String(m).slice(0,200),w=String(_).slice(0,5e3),y=a?String(a).slice(0,100):null,b=c?String(c).slice(0,200):null,N=p?String(p).slice(0,30):null,R=u?String(u).slice(0,500):null,D=i.headers.get("User-Agent")||null,S=i.headers.get("CF-Connecting-IP")||null,T=null;try{let L=i.headers.get("Authorization")||"",I=(L.startsWith("Bearer ")?L.slice(7).trim():null)||h(i);if(I){let B=await t.DB.prepare("SELECT user_id AS id FROM sessions WHERE id = ? LIMIT 1").bind(I).first();B&&(T=B.id)}}catch{}return S&&((await t.DB.prepare(`SELECT COUNT(*) as cnt FROM inquiries
           WHERE ip_address = ? AND created_at > datetime('now', '-1 hour')`).bind(S).first())?.cnt||0)>=Ut&&await t.DB.prepare(`SELECT id FROM inquiries
             WHERE ip_address = ? AND created_at > datetime('now', '-${pt} seconds')
             LIMIT 1`).bind(S).first()?new Response(JSON.stringify({ok:!1,message:`\uC9E7\uC740 \uC2DC\uAC04\uC5D0 \uB108\uBB34 \uB9CE\uC774 \uC81C\uCD9C\uB410\uC5B4\uC694. ${pt}\uCD08 \uD6C4 \uB2E4\uC2DC \uC2DC\uB3C4\uD574\uC8FC\uC138\uC694.`}),{status:429,headers:o}):(await t.DB.prepare(`
        INSERT INTO inquiries (
          type, name, email, phone, title, content, page_url,
          user_agent, ip_address, user_id, status, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', datetime('now'), datetime('now'))
      `).bind(k,y,b,N,E,w,R,D,S,T).run(),new Response(JSON.stringify({ok:!0}),{headers:o}))}catch(e){return new Response(JSON.stringify({ok:!1,message:e.message}),{status:500,headers:o})}let n=d.match(/^\/admin\/inquiry\/(\d+)$/);if(i.method==="DELETE"&&n){if(i.headers.get("Authorization")!==`Bearer ${t.ADMIN_SECRET}`)return new Response(JSON.stringify({ok:!1,message:"Unauthorized"}),{status:401,headers:o});try{return await t.DB.prepare("DELETE FROM inquiries WHERE id = ?").bind(n[1]).run(),new Response(JSON.stringify({ok:!0}),{headers:o})}catch(e){return new Response(JSON.stringify({ok:!1,message:e.message}),{status:500,headers:o})}}let l=d.match(/^\/admin\/inquiry\/(\d+)$/);if(i.method==="PATCH"&&l){if(i.headers.get("Authorization")!==`Bearer ${t.ADMIN_SECRET}`)return new Response(JSON.stringify({ok:!1,message:"Unauthorized"}),{status:401,headers:o});try{let e=await i.json(),{status:r,admin_reply:a}=e;return r&&!Wt.includes(r)?new Response(JSON.stringify({ok:!1,message:"status \uAC12\uC774 \uC62C\uBC14\uB974\uC9C0 \uC54A\uC2B5\uB2C8\uB2E4"}),{status:400,headers:o}):await t.DB.prepare("SELECT id FROM inquiries WHERE id = ?").bind(l[1]).first()?(await t.DB.prepare(`
        UPDATE inquiries
        SET status      = COALESCE(?, status),
            admin_reply = COALESCE(?, admin_reply),
            updated_at  = datetime('now')
        WHERE id = ?
      `).bind(r||null,a??null,l[1]).run(),new Response(JSON.stringify({ok:!0}),{headers:o})):new Response(JSON.stringify({ok:!1,message:"\uCC3E\uC744 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4"}),{status:404,headers:o})}catch(e){return new Response(JSON.stringify({ok:!1,message:e.message}),{status:500,headers:o})}}if(d==="/admin/inquiry"&&i.method==="GET"){if(i.headers.get("Authorization")!==`Bearer ${t.ADMIN_SECRET}`)return new Response(JSON.stringify({ok:!1,message:"Unauthorized"}),{status:401,headers:o});try{let e=s.searchParams.get("type")||"all",r=s.searchParams.get("status")||"all",a=Math.min(parseInt(s.searchParams.get("limit")||"50"),100),c=Math.max(parseInt(s.searchParams.get("offset")||"0"),0),p=[],m=[];e!=="all"&&(p.push("type = ?"),m.push(e)),r!=="all"&&(p.push("status = ?"),m.push(r));let _=p.length?`WHERE ${p.join(" AND ")}`:"",[u,g]=await t.DB.batch([t.DB.prepare(`SELECT * FROM inquiries ${_} ORDER BY created_at DESC LIMIT ? OFFSET ?`).bind(...m,a,c),t.DB.prepare(`SELECT COUNT(*) as cnt FROM inquiries ${_}`).bind(...m)]),k=u.results||[],E=g.results?.[0]?.cnt||0;return new Response(JSON.stringify({ok:!0,data:k,total:E}),{headers:o})}catch(e){return new Response(JSON.stringify({ok:!1,message:e.message}),{status:500,headers:o})}}return null}async function ut(d,i,t){if(!await O(d,i))return new Response(JSON.stringify({ok:!1,error:"\uAD00\uB9AC\uC790 \uC778\uC99D\uC774 \uD544\uC694\uD569\uB2C8\uB2E4."}),{status:401,headers:t});try{let s=await i.DB.prepare("SELECT MAX(date) AS latest_date FROM rankings WHERE date != 'manual'").first();if(!s||!s.latest_date)return new Response(JSON.stringify({ok:!1,error:"rankings \uD14C\uC774\uBE14\uC5D0 \uC720\uD6A8\uD55C \uD06C\uB864\uB9C1 \uB370\uC774\uD130\uAC00 \uC5C6\uC2B5\uB2C8\uB2E4."}),{status:404,headers:t});let o=s.latest_date,n=`
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
    `,{results:l}=await i.DB.prepare(n).bind(o).all(),{results:e}=await i.DB.prepare("SELECT tmdb_id, pinned_score, pinned_platform FROM admin_boosts WHERE is_pinned = 1").all(),r=new Map((e||[]).map(_=>[_.tmdb_id,{score:_.pinned_score??0,platform:_.pinned_platform||null}]));if((!l||l.length===0)&&r.size===0)return new Response(JSON.stringify({ok:!1,error:"\uACC4\uC0B0\uD560 \uB7AD\uD0B9 \uB370\uC774\uD130\uAC00 \uC5C6\uC2B5\uB2C8\uB2E4."}),{status:404,headers:t});let a=[],c=new Set;for(let _ of l||[])if(c.add(_.tmdb_id),r.has(_.tmdb_id)){let u=r.get(_.tmdb_id);a.push({tmdb_id:_.tmdb_id,best_platform:u.platform||_.best_platform,best_rank:_.best_rank,rank_score:0,platform_weight:0,weighted_score:0,admin_boost:u.score})}else a.push(_);for(let[_,u]of r)c.has(_)||a.push({tmdb_id:_,best_platform:u.platform||"manual",best_rank:null,rank_score:0,platform_weight:0,weighted_score:0,admin_boost:u.score});a.sort((_,u)=>u.weighted_score+u.admin_boost-(_.weighted_score+_.admin_boost));let p=new Date(Date.now()+540*60*1e3).toISOString().slice(0,19).replace("T"," "),m=[i.DB.prepare("DELETE FROM hot100_scores")];for(let _ of a){let u=_.weighted_score+_.admin_boost;m.push(i.DB.prepare(`INSERT INTO hot100_scores
            (tmdb_id, calc_date, best_platform, platform_weight,
             rank_score, weighted_rank_score, engagement_score,
             admin_boost, total_score, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?, ?)`).bind(_.tmdb_id,o,_.best_platform,_.platform_weight,_.rank_score,_.weighted_score,_.admin_boost,u,p))}return await i.DB.batch(m),new Response(JSON.stringify({ok:!0,calc_date:o,total_works:a.length,top10_preview:a.slice(0,10).map(_=>({tmdb_id:_.tmdb_id,best_platform:_.best_platform,best_rank:_.best_rank,total_score:_.weighted_score+_.admin_boost}))}),{status:200,headers:t})}catch(s){return console.error("calcHot100 \uC624\uB958:",s),new Response(JSON.stringify({ok:!1,error:"HOT100 \uACC4\uC0B0 \uC911 \uC624\uB958\uAC00 \uBC1C\uC0DD\uD588\uC2B5\uB2C8\uB2E4.",detail:s.message}),{status:500,headers:t})}}async function ft(d,i,t){if(!await O(d,i))return new Response(JSON.stringify({ok:!1,error:"\uAD00\uB9AC\uC790 \uC778\uC99D\uC774 \uD544\uC694\uD569\uB2C8\uB2E4."}),{status:401,headers:t});try{let{results:s}=await i.DB.prepare(`SELECT ab.tmdb_id, ab.boost_value, ab.reason, ab.is_pinned, ab.pinned_score, ab.pinned_platform, ab.updated_at,
              w.title_ko, w.poster_path
       FROM admin_boosts ab
       LEFT JOIN works w ON w.tmdb_id = ab.tmdb_id
       ORDER BY ab.updated_at DESC`).all();return new Response(JSON.stringify({ok:!0,data:s||[]}),{status:200,headers:t})}catch(s){return new Response(JSON.stringify({ok:!1,error:s.message}),{status:500,headers:t})}}async function gt(d,i,t){if(!await O(d,i))return new Response(JSON.stringify({ok:!1,error:"\uAD00\uB9AC\uC790 \uC778\uC99D\uC774 \uD544\uC694\uD569\uB2C8\uB2E4."}),{status:401,headers:t});try{let o=(new URL(d.url).searchParams.get("q")||"").trim();if(!o)return new Response(JSON.stringify({ok:!0,data:[]}),{status:200,headers:t});let{results:n}=await i.DB.prepare(`SELECT w.tmdb_id, w.title_ko, w.title_en, w.poster_path,
              COALESCE(ab.boost_value, 0) AS boost_value,
              COALESCE(ab.is_pinned, 0) AS is_pinned,
              ab.pinned_score,
              ab.pinned_platform
       FROM works w
       LEFT JOIN admin_boosts ab ON ab.tmdb_id = w.tmdb_id
       WHERE w.title_ko LIKE ? OR w.title_en LIKE ? OR w.tmdb_id = ?
       ORDER BY w.tmdb_id DESC
       LIMIT 20`).bind(`%${o}%`,`%${o}%`,parseInt(o,10)||0).all();return new Response(JSON.stringify({ok:!0,data:n||[]}),{status:200,headers:t})}catch(s){return new Response(JSON.stringify({ok:!1,error:s.message}),{status:500,headers:t})}}async function Et(d,i,t){if(!await O(d,i))return new Response(JSON.stringify({ok:!1,error:"\uAD00\uB9AC\uC790 \uC778\uC99D\uC774 \uD544\uC694\uD569\uB2C8\uB2E4."}),{status:401,headers:t});try{let s=await d.json(),{tmdb_id:o,boost_value:n,reason:l,is_pinned:e,pinned_score:r,pinned_platform:a}=s;if(!o)return new Response(JSON.stringify({ok:!1,error:"tmdb_id\uAC00 \uD544\uC694\uD569\uB2C8\uB2E4."}),{status:400,headers:t});let c=e,p=r,m=a;if(e===void 0){let u=await i.DB.prepare("SELECT is_pinned, pinned_score, pinned_platform FROM admin_boosts WHERE tmdb_id = ?").bind(o).first();c=u?.is_pinned||0,p=u?.pinned_score??null,m=u?.pinned_platform??null}let _=new Date(Date.now()+540*60*1e3).toISOString().slice(0,19).replace("T"," ");return await i.DB.prepare(`INSERT INTO admin_boosts (tmdb_id, boost_value, reason, is_pinned, pinned_score, pinned_platform, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(tmdb_id) DO UPDATE SET
         boost_value = excluded.boost_value,
         reason = excluded.reason,
         is_pinned = excluded.is_pinned,
         pinned_score = excluded.pinned_score,
         pinned_platform = excluded.pinned_platform,
         updated_at = excluded.updated_at`).bind(o,n||0,l||null,c?1:0,c?p??0:null,c&&m||null,_).run(),new Response(JSON.stringify({ok:!0}),{status:200,headers:t})}catch(s){return new Response(JSON.stringify({ok:!1,error:s.message}),{status:500,headers:t})}}async function wt(d,i,t,f){if(!await O(i,t))return new Response(JSON.stringify({ok:!1,error:"\uAD00\uB9AC\uC790 \uC778\uC99D\uC774 \uD544\uC694\uD569\uB2C8\uB2E4."}),{status:401,headers:f});try{return await t.DB.prepare("DELETE FROM admin_boosts WHERE tmdb_id = ?").bind(d).run(),new Response(JSON.stringify({ok:!0}),{status:200,headers:f})}catch(o){return new Response(JSON.stringify({ok:!1,error:o.message}),{status:500,headers:f})}}async function kt(d,i,t){try{let f=new URL(d.url),s=parseInt(f.searchParams.get("limit")||"100",10),o=Number.isNaN(s)?100:Math.min(s,100),n=`
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
        w.media_type,
        w.tmdb_rating,
        w.release_year
      FROM hot100_scores h
      LEFT JOIN works w ON w.tmdb_id = h.tmdb_id
      LEFT JOIN admin_boosts ab ON ab.tmdb_id = h.tmdb_id
      ORDER BY h.total_score DESC, w.tmdb_rating DESC
      LIMIT ?
    `,{results:l}=await i.DB.prepare(n).bind(o).all();return!l||l.length===0?new Response(JSON.stringify({ok:!0,data:[]}),{status:200,headers:t}):new Response(JSON.stringify({ok:!0,data:l.map((e,r)=>({hot_rank:r+1,...e}))}),{status:200,headers:t})}catch(f){return console.error("getHot100 \uC624\uB958:",f),new Response(JSON.stringify({ok:!1,error:"HOT100 \uC870\uD68C \uC911 \uC624\uB958\uAC00 \uBC1C\uC0DD\uD588\uC2B5\uB2C8\uB2E4.",detail:f.message}),{status:500,headers:t})}}var be={async fetch(d,i,t){let f=new URL(d.url),s=f.pathname,o=d.headers.get("Origin")||"https://ottrank.kr",l=["https://ottrank.kr","http://localhost:8788","http://localhost:3000"].includes(o)?o:"https://ottrank.kr",e={"Content-Type":"application/json","Access-Control-Allow-Origin":l,"Access-Control-Allow-Credentials":"true"};if(d.method==="OPTIONS")return new Response(null,{headers:{"Access-Control-Allow-Origin":l,"Access-Control-Allow-Credentials":"true","Access-Control-Allow-Methods":"GET, POST, PUT, PATCH, DELETE, OPTIONS","Access-Control-Allow-Headers":"Content-Type, Authorization"}});let r=null;(s.startsWith("/contents")||s.startsWith("/admin/contents"))&&(r=await it(s,d,i,f,e)),!r&&s.startsWith("/auth/")&&(r=await tt(s,d,i,e)),!r&&(s.startsWith("/rankings")||s==="/latest-date"||s==="/platforms"||s==="/sitemap.xml")&&(r=await G(s,d,i,f,e)),!r&&(s.startsWith("/videos/")||s.startsWith("/admin/videos")||s.startsWith("/imdb/")||s.startsWith("/youtube/")||s.startsWith("/works/")||s.startsWith("/kmrb/")||s.startsWith("/search/"))&&(r=await v(s,d,i,t,f,e)),!r&&(s.startsWith("/reactions")||s.startsWith("/admin/reactions"))&&(r=await q(s,d,i,t,e)),!r&&(s.startsWith("/wishlist")||s.startsWith("/reviews")||s.startsWith("/mypage")||s.startsWith("/user/")||s==="/grade-settings"||s.startsWith("/life-works")||s.startsWith("/pick-lists")||s.startsWith("/admin/reviews"))&&(r=await et(s,d,i,t,e)),!r&&s.startsWith("/posts")&&(r=await st(s,d,i,t,f,e)),!r&&s.startsWith("/blog-gen")&&(r=await mt(s,d,i,f,e)),!r&&s.startsWith("/work-ott")&&(r=await Y(s,d,i,f,e)),!r&&(s==="/inquiry"||s.startsWith("/admin/inquiry"))&&(r=await _t(s,d,i,t,f,e)),!r&&s==="/admin/calc-hot100"&&(r=await ut(d,i,e)),!r&&s==="/hot100"&&(r=await kt(d,i,e)),!r&&s==="/admin/hot100/boosts/search"&&d.method==="GET"&&(r=await gt(d,i,e)),!r&&s==="/admin/hot100/boosts"&&d.method==="GET"&&(r=await ft(d,i,e)),!r&&s==="/admin/hot100/boosts"&&d.method==="POST"&&(r=await Et(d,i,e));let a=s.match(/^\/admin\/hot100\/boosts\/(\d+)$/);return!r&&a&&d.method==="DELETE"&&(r=await wt(parseInt(a[1],10),d,i,e)),!r&&s.startsWith("/admin/")&&(r=await Y(s,d,i,f,e)),r||(r=new Response(JSON.stringify({ok:!1,message:"Not found"}),{status:404,headers:e})),r}};export{be as default};
