function $(d,i,t){if(!i.length)return d.slice(0,t).map((r,a)=>({...r,rank:a+1}));let g=new Set(i.map(r=>r.tmdb_id).filter(Boolean)),e=d.filter(r=>!g.has(r.tmdb_id)),o={};for(let r of i){let a=Math.max(1,parseInt(r.rank)||1);o[a]||(o[a]=[]),o[a].push(r)}let n=[],c=0,s=1;for(;n.length<t;){if(o[s]&&o[s].length){let r=o[s].shift();n.push({...r,rank:n.length+1})}else if(c<e.length)n.push({...e[c],rank:n.length+1}),c++;else{let r=Object.values(o).flat();for(let a of r){if(n.length>=t)break;n.push({...a,rank:n.length+1})}break}s++}return n}async function G(d,i,t,g,e){if(d==="/rankings"&&i.method==="GET"){let o=g.searchParams.get("platform"),n=g.searchParams.get("category"),c=g.searchParams.get("date"),s="SELECT * FROM rankings WHERE 1=1",r=[];o&&(s+=" AND platform = ?",r.push(o)),n&&(s+=" AND category = ?",r.push(n)),c?(s+=" AND date = ?",r.push(c)):s+=" AND date = (SELECT MAX(date) FROM rankings)",s+=" ORDER BY platform, category, rank";let{results:a}=await t.DB.prepare(s).bind(...r).all();return new Response(JSON.stringify({ok:!0,data:a}),{headers:e})}if(d==="/rankings/main"&&i.method==="GET")try{let o=g.searchParams.get("date")||null,{results:n}=await t.DB.prepare(`
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
      `).bind(o).all(),{results:c}=await t.DB.prepare(`
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
      `).all(),s={},r={},a={};for(let E of n){let w=`${E.platform}__${E.category_slot}`;s[w]||(s[w]=[]),a[w]||(a[w]=E),s[w].push(E)}for(let E of c){let w=`${E.platform}__${E.category_slot}`;r[w]||(r[w]=[]),a[w]||(a[w]=E),r[w].push(E)}let l={},p={},_={},f=new Set([...Object.keys(s),...Object.keys(r)]);for(let E of f){let w=a[E];if(!w)continue;let y=w.main_limit||10,O=$((s[E]||[]).sort((N,R)=>N.rank-R.rank),(r[E]||[]).sort((N,R)=>N.rank-R.rank),y);for(let N of O){let R={rank:N.rank,title_ko:N.title_ko,title_en:N.title_en,tmdb_id:N.tmdb_id,poster_path:N.poster_path,genre:N.genre,tmdb_rating:N.tmdb_rating,release_year:N.release_year,memo:N.memo||null,display_name:w.display_name,platform:w.platform,category_slot:w.category_slot,main_order:w.main_order};w.main_section==="tv"?(l[E]||(l[E]={platform:w.platform,category_slot:w.category_slot,display_name:w.display_name,main_order:w.main_order,memo_label:w.memo_label||null,items:[]}),l[E].items.push(R)):w.main_section==="movie"?(p[E]||(p[E]={platform:w.platform,category_slot:w.category_slot,display_name:w.display_name,main_order:w.main_order,memo_label:w.memo_label||null,items:[]}),p[E].items.push(R)):w.main_section==="featured"&&w.platform==="netflix"&&(_[E]||(_[E]={platform:w.platform,category_slot:w.category_slot,display_name:w.display_name,main_order:w.main_order,memo_label:w.memo_label||null,items:[]}),_[E].items.push(R))}}let u=Object.values(l).sort((E,w)=>E.main_order-w.main_order),m=Object.values(p).sort((E,w)=>E.main_order-w.main_order),k=Object.values(_).sort((E,w)=>E.main_order-w.main_order).slice(0,2);return new Response(JSON.stringify({ok:!0,tv:u,movie:m,featured:k}),{headers:e})}catch(o){return new Response(JSON.stringify({ok:!1,message:o.message}),{status:500,headers:e})}if(d==="/rankings/platform"&&i.method==="GET")try{let o=g.searchParams.get("platform"),n=g.searchParams.get("date")||null;if(!o)return new Response(JSON.stringify({ok:!1,message:"platform required"}),{status:400,headers:e});let{results:c}=await t.DB.prepare(`
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
      `).bind(o,n).all(),{results:s}=await t.DB.prepare(`
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
      `).bind(o).all(),r={},a={},l={};for(let u of c){let m=u.category_slot;r[m]||(r[m]=[]),l[m]||(l[m]=u),r[m].push(u)}for(let u of s){let m=u.category_slot;a[m]||(a[m]=[]),l[m]||(l[m]=u),a[m].push(u)}let p={},_=new Set([...Object.keys(r),...Object.keys(a)]);for(let u of _){let m=l[u];if(!m)continue;let k=m.platform_limit||20,E=$((r[u]||[]).sort((w,y)=>w.rank-y.rank),(a[u]||[]).sort((w,y)=>w.rank-y.rank),k);p[u]={platform:m.platform,category_slot:m.category_slot,display_name:m.display_name,platform_order:m.platform_order,memo_label:m.memo_label||null,items:E.map(w=>({rank:w.rank,title_ko:w.title_ko,title_en:w.title_en,tmdb_id:w.tmdb_id,poster_path:w.poster_path,genre:w.genre,tmdb_rating:w.tmdb_rating,release_year:w.release_year,memo:w.memo||null}))}}let f=Object.values(p).sort((u,m)=>u.platform_order-m.platform_order);return new Response(JSON.stringify({ok:!0,data:f}),{headers:e})}catch(o){return new Response(JSON.stringify({ok:!1,message:o.message}),{status:500,headers:e})}if(d==="/rankings/weekly"&&i.method==="GET")try{let{results:o}=await t.DB.prepare(`
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
      `).all(),n={},c={};for(let a of o){if(a.rank>(a.main_limit||10))continue;let l=`${a.platform}__${a.category_slot}`,p={rank:a.rank,title_ko:a.title_ko,title_en:a.title_en,tmdb_id:a.tmdb_id,poster_path:a.poster_path,genre:a.genre,tmdb_rating:a.tmdb_rating,release_year:a.release_year,platform:a.platform,category_slot:a.category_slot,display_name:a.display_name,main_order:a.main_order};a.main_section==="tv"?(n[l]||(n[l]={platform:a.platform,category_slot:a.category_slot,display_name:a.display_name,main_order:a.main_order,items:[]}),n[l].items.push(p)):a.main_section==="movie"&&(c[l]||(c[l]={platform:a.platform,category_slot:a.category_slot,display_name:a.display_name,main_order:a.main_order,items:[]}),c[l].items.push(p))}let s=Object.values(n).sort((a,l)=>a.main_order-l.main_order),r=Object.values(c).sort((a,l)=>a.main_order-l.main_order);return new Response(JSON.stringify({ok:!0,tv:s,movie:r}),{headers:e})}catch(o){return new Response(JSON.stringify({ok:!1,message:o.message}),{status:500,headers:e})}if(d==="/rankings/monthly"&&i.method==="GET")try{let{results:o}=await t.DB.prepare(`
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
      `).all(),n={},c={};for(let a of o){if(a.rank>(a.main_limit||10))continue;let l=`${a.platform}__${a.category_slot}`,p={rank:a.rank,title_ko:a.title_ko,title_en:a.title_en,tmdb_id:a.tmdb_id,poster_path:a.poster_path,genre:a.genre,tmdb_rating:a.tmdb_rating,release_year:a.release_year,platform:a.platform,category_slot:a.category_slot,display_name:a.display_name,main_order:a.main_order};a.main_section==="tv"?(n[l]||(n[l]={platform:a.platform,category_slot:a.category_slot,display_name:a.display_name,main_order:a.main_order,items:[]}),n[l].items.push(p)):a.main_section==="movie"&&(c[l]||(c[l]={platform:a.platform,category_slot:a.category_slot,display_name:a.display_name,main_order:a.main_order,items:[]}),c[l].items.push(p))}let s=Object.values(n).sort((a,l)=>a.main_order-l.main_order),r=Object.values(c).sort((a,l)=>a.main_order-l.main_order);return new Response(JSON.stringify({ok:!0,tv:s,movie:r}),{headers:e})}catch(o){return new Response(JSON.stringify({ok:!1,message:o.message}),{status:500,headers:e})}if(d==="/rankings/history"&&i.method==="GET"){let o=parseInt(g.searchParams.get("tmdb_id"));if(!o)return new Response(JSON.stringify({ok:!1,message:"tmdb_id required"}),{status:400,headers:e});let{results:n}=await t.DB.prepare(`
      SELECT date, platform, category_slot, rank
      FROM rankings
      WHERE tmdb_id = ?
        AND date != 'manual'
        AND date >= date((SELECT MAX(date) FROM rankings WHERE date != 'manual'), '-29 days')
      ORDER BY date ASC, platform ASC
    `).bind(o).all();return new Response(JSON.stringify({ok:!0,data:n}),{headers:e})}if(d.startsWith("/rankings/platforms/")&&i.method==="GET"){let o=parseInt(d.split("/rankings/platforms/")[1]);if(!o)return new Response(JSON.stringify({ok:!1,message:"tmdb_id required"}),{status:400,headers:e});try{let{results:n}=await t.DB.prepare(`
        SELECT DISTINCT platform, MIN(rank) as rank
        FROM rankings
        WHERE tmdb_id = ?
          AND date = (SELECT MAX(date) FROM rankings WHERE date != 'manual')
        GROUP BY platform
        ORDER BY rank ASC
      `).bind(o).all();return new Response(JSON.stringify({ok:!0,data:n}),{headers:e})}catch(n){return new Response(JSON.stringify({ok:!1,message:n.message}),{status:500,headers:e})}}if(d==="/rankings/platforms-batch"&&i.method==="GET"){let o=(g.searchParams.get("tmdb_ids")||"").trim();if(!o)return new Response(JSON.stringify({ok:!1,message:"tmdb_ids required"}),{status:400,headers:e});let n=[...new Set(o.split(",").map(c=>parseInt(c.trim())).filter(c=>Number.isInteger(c)&&c>0))].slice(0,50);if(!n.length)return new Response(JSON.stringify({ok:!1,message:"\uC720\uD6A8\uD55C tmdb_ids\uAC00 \uC5C6\uC2B5\uB2C8\uB2E4"}),{status:400,headers:e});try{let c=n.map(()=>"?").join(","),{results:s}=await t.DB.prepare(`
        SELECT tmdb_id, platform, MIN(rank) as rank
        FROM rankings
        WHERE tmdb_id IN (${c})
          AND date = (SELECT MAX(date) FROM rankings WHERE date != 'manual')
        GROUP BY tmdb_id, platform
        ORDER BY tmdb_id, rank ASC
      `).bind(...n).all(),r={};for(let a of s)r[a.tmdb_id]||(r[a.tmdb_id]=[]),r[a.tmdb_id].push({platform:a.platform,rank:a.rank});return new Response(JSON.stringify({ok:!0,data:r}),{headers:e})}catch(c){return new Response(JSON.stringify({ok:!1,message:c.message}),{status:500,headers:e})}}if(d==="/rankings/person-widget"&&i.method==="GET")try{let o=await t.DB.prepare(`
        SELECT platform, category_slot, display_name, person_limit
        FROM ott_categories
        WHERE person_section = 'person'
          AND is_active = 1
        ORDER BY person_order ASC
        LIMIT 1
      `).first();if(!o)return new Response(JSON.stringify({ok:!0,data:null}),{headers:e});let n=o.person_limit||10,{results:c}=await t.DB.prepare(`
        SELECT r.rank, r.title_ko, r.title_en, r.tmdb_id, r.poster_path, r.genre,
               r.tmdb_rating, r.release_year, w.media_type
        FROM rankings r
        LEFT JOIN works w ON r.tmdb_id = w.tmdb_id
        WHERE r.platform = ? AND r.category_slot = ?
          AND r.date = (SELECT MAX(date) FROM rankings WHERE date != 'manual')
        ORDER BY r.rank ASC
      `).bind(o.platform,o.category_slot).all(),{results:s}=await t.DB.prepare(`
        SELECT r.rank, r.title_ko, r.title_en, r.tmdb_id, r.poster_path, r.genre,
               r.tmdb_rating, r.release_year, w.media_type
        FROM rankings r
        LEFT JOIN works w ON r.tmdb_id = w.tmdb_id
        WHERE r.platform = ? AND r.category_slot = ?
          AND r.is_manual = 1 AND r.date = 'manual'
        ORDER BY r.rank ASC
      `).bind(o.platform,o.category_slot).all(),r=$(c,s,n);return new Response(JSON.stringify({ok:!0,data:{platform:o.platform,category_slot:o.category_slot,display_name:o.display_name,items:r.map(a=>({rank:a.rank,title_ko:a.title_ko,title_en:a.title_en,tmdb_id:a.tmdb_id,poster_path:a.poster_path,genre:a.genre,tmdb_rating:a.tmdb_rating,release_year:a.release_year,media_type:a.media_type||null}))}}),{headers:e})}catch(o){return new Response(JSON.stringify({ok:!1,message:o.message}),{status:500,headers:e})}if(d.startsWith("/rankings/manual/")&&i.method==="GET"){let o=parseInt(d.split("/rankings/manual/")[1]);if(!o)return new Response(JSON.stringify({ok:!1,message:"tmdb_id required"}),{status:400,headers:e});try{let{results:n}=await t.DB.prepare(`
        SELECT
          r.rank, r.memo, r.platform, r.category_slot,
          oc.display_name, oc.memo_label
        FROM rankings r
        LEFT JOIN ott_categories oc
          ON r.platform = oc.platform AND r.category_slot = oc.category_slot
        WHERE r.tmdb_id = ? AND r.date = 'manual'
        ORDER BY r.rank ASC
      `).bind(o).all();return new Response(JSON.stringify({ok:!0,data:n}),{headers:e})}catch(n){return new Response(JSON.stringify({ok:!1,message:n.message}),{status:500,headers:e})}}if(d==="/latest-date"){let{results:o}=await t.DB.prepare("SELECT MAX(date) as date FROM rankings WHERE date != 'manual'").all();return new Response(JSON.stringify({ok:!0,data:o[0]}),{headers:e})}if(d==="/platforms"){let{results:o}=await t.DB.prepare("SELECT DISTINCT platform FROM rankings ORDER BY platform").all();return new Response(JSON.stringify({ok:!0,data:o}),{headers:e})}if(d==="/sitemap.xml")try{let o="https://ottrank.kr",n=new Date().getFullYear(),c=[{path:"/",changefreq:"daily",priority:"1.0"},{path:"/netflix",changefreq:"daily",priority:"0.9"},{path:"/tving",changefreq:"daily",priority:"0.9"},{path:"/disneyplus",changefreq:"daily",priority:"0.9"},{path:"/wavve",changefreq:"daily",priority:"0.9"},{path:"/coupangplay",changefreq:"daily",priority:"0.9"},{path:"/boxoffice",changefreq:"daily",priority:"0.9"},{path:"/community",changefreq:"daily",priority:"0.8"},{path:"/review",changefreq:"daily",priority:"0.8"},{path:"/reactions",changefreq:"daily",priority:"0.8"},{path:"/contents",changefreq:"daily",priority:"0.8"},{path:"/mypage",changefreq:"weekly",priority:"0.6"},{path:"/my_review",changefreq:"weekly",priority:"0.6"},{path:"/ott_intro.html",changefreq:"monthly",priority:"0.6"},{path:"/privacy",changefreq:"monthly",priority:"0.4"},{path:"/terms",changefreq:"monthly",priority:"0.4"}],{results:s}=await t.DB.prepare("SELECT tmdb_id FROM works WHERE tmdb_id IS NOT NULL ORDER BY tmdb_id").all(),{results:r}=await t.DB.prepare("SELECT tmdb_id FROM persons WHERE tmdb_id IS NOT NULL ORDER BY tmdb_id").all(),a=[];for(let p of c)a.push(`  <url>
    <loc>${o}${p.path}</loc>
    <changefreq>${p.changefreq}</changefreq>
    <priority>${p.priority}</priority>
  </url>`);for(let p of s){let _=`${o}/title/1-${n}${p.tmdb_id}`;a.push(`  <url>
    <loc>${_}</loc>
    <changefreq>weekly</changefreq>
    <priority>0.7</priority>
  </url>`)}for(let p of r){let _=`${o}/person/${p.tmdb_id}`;a.push(`  <url>
    <loc>${_}</loc>
    <changefreq>monthly</changefreq>
    <priority>0.5</priority>
  </url>`)}let l=`<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
`+a.join(`
`)+`
</urlset>`;return new Response(l,{headers:{...e,"Content-Type":"application/xml; charset=utf-8"}})}catch(o){return new Response(JSON.stringify({ok:!1,message:o.message}),{status:500,headers:e})}return null}function b(d,i){return(d.headers.get("Authorization")||"").replace("Bearer ","")===i.ADMIN_SECRET}function h(d){let t=(d.headers.get("Cookie")||"").match(/session=([^;]+)/);return t?t[1]:null}async function H(d,i,t,g){try{return await g.DB.prepare("INSERT INTO user_point_logs (user_id, points, reason) VALUES (?, ?, ?)").bind(d,i,t).run(),await g.DB.prepare("UPDATE users SET ott_points = MAX(0, COALESCE(ott_points, 0) + ?) WHERE id = ?").bind(i,d).run(),await F(d,g),!0}catch(e){return console.error("[_addOttPoints] \uC624\uB958:",e.message),!1}}async function F(d,i){try{let t=await i.DB.prepare("SELECT grade, ott_points FROM users WHERE id = ?").bind(d).first();if(!t||(await i.DB.prepare("SELECT is_special FROM grade_settings WHERE grade_key = ?").bind(t.grade||"rookie").first())?.is_special)return;let{results:e}=await i.DB.prepare(`SELECT grade_key FROM grade_settings
       WHERE is_special = 0 AND min_ott_points <= ?
       ORDER BY min_ott_points DESC LIMIT 1`).bind(t.ott_points||0).all(),o=e[0]?.grade_key||null;o&&o!==t.grade&&await i.DB.prepare("UPDATE users SET grade = ? WHERE id = ?").bind(o,d).run()}catch(t){console.error("[GRADE]",t.message)}}async function V(d,i){try{let O=function(D){if(!D||!y.length)return!0;let S=D.toLowerCase(),T=y.filter(C=>S.includes(C.toLowerCase())).length,L=y.length<=2?1:y.length===3?2:3;return T>=L},t=await i.DB.prepare("SELECT title_ko, title_en FROM works WHERE tmdb_id = ?").bind(d).first();if(!t?.title_ko)return console.log(`[YT_CRAWL] tmdb_id=${d} works \uC5C6\uC74C \u2014 \uC2A4\uD0B5`),0;let g=t.title_ko,e=t.title_en||"",o=await i.DB.prepare("SELECT platform, category_slot FROM rankings WHERE tmdb_id = ? ORDER BY date DESC LIMIT 1").bind(d).first(),n=new Set(["category07","category08"]),s=o?.platform==="netflix"&&n.has(o?.category_slot),r=s?"en":"ko",a=s&&e||g;console.log(`[YT_CRAWL] tmdb_id=${d} "${g}" \u2192 ${s?"\uC601\uC5B4":"\uD55C\uAD6D\uC5B4"} \uAC80\uC0C9 \uBAA8\uB4DC (slot=${o?.category_slot||"none"})`);let _=s?{netflix:"Netflix",tving:"Tving",disney:"Disney+",wavve:"Wavve",coupang:"Coupang Play",boxoffice:"Movie"}:{netflix:"\uB137\uD50C\uB9AD\uC2A4",tving:"\uD2F0\uBE59",disney:"\uB514\uC988\uB2C8\uD50C\uB7EC\uC2A4",wavve:"\uC6E8\uC774\uBE0C",coupang:"\uCFE0\uD321\uD50C\uB808\uC774",boxoffice:"\uC601\uD654"},f=o?.platform&&_[o.platform]||"",u=f?`${f} ${a}`:a,{results:m}=await i.DB.prepare("SELECT youtube_id, is_main FROM title_videos WHERE tmdb_id = ?").bind(d).all(),k=new Set(m.map(D=>D.youtube_id)),E=new Set(m.filter(D=>D.is_main===1).map(D=>D.youtube_id));E.size>0&&console.log(`[YT_CRAWL] tmdb_id=${d} \uBA54\uC778 \uC601\uC0C1 ${E.size}\uAC1C \uBCF4\uD638 \uC911`);let w=s?[`${u} official trailer`,`${u} trailer`]:[`${u} \uACF5\uC2DD \uC608\uACE0\uD3B8`,`${u} \uC608\uACE0\uD3B8`],y=a.replace(/[:\-·|]/g," ").replace(/[^\uAC00-\uD7A3a-zA-Z0-9\s]/g,"").split(/\s+/).filter(D=>D.length>=2),N=2,R=[];for(let D of w){if(R.length>=N)break;let S=`https://www.googleapis.com/youtube/v3/search?part=snippet&type=video&order=relevance&maxResults=8&relevanceLanguage=${r}&q=${encodeURIComponent(D)}&key=${i.YOUTUBE_API_KEY}`,T=await fetch(S),L=await T.json();if(!(!T.ok||!L.items?.length))for(let C of L.items){if(R.length>=N)break;let I=C.id?.videoId,B=C.snippet?.title||"";!I||k.has(I)||E.has(I)||O(B)&&(R.push({youtube_id:I,title:B||a,youtube_url:`https://www.youtube.com/watch?v=${I}`}),k.add(I))}}if(!R.length)return console.log(`[YT_CRAWL] tmdb_id=${d} "${u}" \uACB0\uACFC \uC5C6\uC74C (\uAD00\uB828\uC131 \uD544\uD130 \uD1B5\uACFC \uC601\uC0C1 \uC5C6\uC74C)`),0;for(let D of R)await i.DB.prepare(`
        INSERT OR IGNORE INTO title_videos (tmdb_id, youtube_url, youtube_id, title, is_main)
        VALUES (?, ?, ?, ?, 0)
      `).bind(d,D.youtube_url,D.youtube_id,D.title).run();return console.log(`[YT_CRAWL] \u2705 tmdb_id=${d} "${u}" ${R.length}\uAC1C \uC800\uC7A5`),R.length}catch(t){return console.error(`[YT_CRAWL] tmdb_id=${d} \uC624\uB958:`,t.message),0}}async function X(d,i){return V(d,i)}async function Q(d,i){let t=await V(d,i);try{await i.DB.prepare("UPDATE works SET yt_crawl_attempted_at = datetime('now') WHERE tmdb_id = ?").bind(d).run()}catch(g){console.error(`[YT_CRAWL_BATCH] tmdb_id=${d} \uC2DC\uB3C4 \uC2DC\uAC01 \uAE30\uB85D \uC2E4\uD328:`,g.message)}return t}async function Z(d,i){try{let g=(await i.DB.prepare("SELECT media_type FROM works WHERE tmdb_id = ?").bind(d).first())?.media_type||"tv",e=[];try{e=(await(await fetch(`https://api.themoviedb.org/3/${g}/${d}/videos?language=ko-KR&api_key=${i.TMDB_API_KEY}`)).json()).results||[]}catch{}if(!e.length)try{e=(await(await fetch(`https://api.themoviedb.org/3/${g}/${d}/videos?language=en-US&api_key=${i.TMDB_API_KEY}`)).json()).results||[]}catch{}let o=e.filter(c=>c.site==="YouTube"),n=[...o.filter(c=>c.type==="Trailer"||c.type==="Teaser"),...o.filter(c=>c.type!=="Trailer"&&c.type!=="Teaser")];if(!n.length)return console.log(`[TMDB_SAVE] tmdb_id=${d} TMDB \uC601\uC0C1 \uC5C6\uC74C`),0;for(let c=0;c<n.length;c++){let s=n[c],r=c===0?1:0;await i.DB.prepare(`
        INSERT OR IGNORE INTO title_videos (tmdb_id, youtube_url, youtube_id, title, is_main)
        VALUES (?, ?, ?, ?, ?)
      `).bind(d,`https://www.youtube.com/watch?v=${s.key}`,s.key,s.name||"",r).run()}return console.log(`[TMDB_SAVE] \u2705 tmdb_id=${d} ${n.length}\uAC1C \uC800\uC7A5`),n.length}catch(t){return console.error(`[TMDB_SAVE] tmdb_id=${d} \uC624\uB958:`,t.message),0}}async function j(d,i,t,g){try{console.log(`[REACTION] \uB313\uAE00 \uC218\uC9D1 \uC2DC\uC791: reaction=${d} video=${i}`);let e="https://www.googleapis.com/youtube/v3/commentThreads?part=snippet&videoId="+i+"&maxResults=100&order=relevance&key="+g.YOUTUBE_API_KEY,o=await fetch(e),n=await o.json();if(!o.ok||!n.items?.length){console.error("[REACTION] YouTube API \uC624\uB958:",JSON.stringify(n).slice(0,200));return}let s=n.items.map(u=>{let m=u.snippet.topLevelComment.snippet;return{author:(m.authorDisplayName||"\uC775\uBA85").replace(/^@/,""),text:(m.textDisplay||"").replace(/<[^>]*>/g,"").trim(),likes:m.likeCount||0,published:m.publishedAt||""}}).filter(u=>u.text.length>5).sort((u,m)=>m.likes-u.likes).slice(0,50);if(!s.length)return;let a=`\uC544\uB798\uB294 YouTube \uC601\uC0C1\uC758 \uD574\uC678 \uB313\uAE00 \uBAA9\uB85D\uC785\uB2C8\uB2E4.
\uAC01 \uB313\uAE00\uC744 \uC790\uC5F0\uC2A4\uB7EC\uC6B4 \uD55C\uAD6D\uC5B4\uB85C \uBC88\uC5ED\uD558\uC138\uC694.

\uBC18\uB4DC\uC2DC \uC544\uB798 JSON \uD615\uC2DD\uC73C\uB85C\uB9CC \uC751\uB2F5\uD558\uC138\uC694 (\uB2E4\uB978 \uD14D\uC2A4\uD2B8 \uC5C6\uC774):
[
  {"idx": 0, "translated": "\uBC88\uC5ED\uB41C \uB313\uAE00"},
  ...
]

\uB313\uAE00 \uBAA9\uB85D:
`+s.map((u,m)=>m+1+". "+u.text.slice(0,300)).join(`
`),_=(await(await fetch("https://api.anthropic.com/v1/messages",{method:"POST",headers:{"Content-Type":"application/json","x-api-key":g.ANTHROPIC_API_KEY,"anthropic-version":"2023-06-01"},body:JSON.stringify({model:"claude-haiku-4-5-20251001",max_tokens:4e3,messages:[{role:"user",content:a}]})})).json()).content?.[0]?.text||"[]",f=[];try{let u=_.split("```json").join("").split("```").join("").trim(),m=JSON.parse(u);f=Array.isArray(m)?m:[]}catch{console.error("[REACTION] Claude \uC751\uB2F5 \uD30C\uC2F1 \uC2E4\uD328:",_.slice(0,300)),f=[]}await g.DB.prepare("DELETE FROM reaction_comments WHERE reaction_id = ?").bind(d).run();for(let u=0;u<s.length;u++){let m=s[u],E=(f.find(w=>w.idx===u)||f.find(w=>w.idx===u+1)||f[u]||{}).translated||"";await g.DB.prepare(`
        INSERT INTO reaction_comments
          (reaction_id, tmdb_id, original_text, translated_text, author, like_count, sentiment)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).bind(d,t,m.text.slice(0,1e3),E.slice(0,1e3),m.author.slice(0,100),m.likes,"neutral").run()}console.log(`[REACTION] \u2705 \uC644\uB8CC: reaction=${d} \uB313\uAE00 ${s.length}\uAC1C \uC800\uC7A5`)}catch(e){console.error("[REACTION] \uC624\uB958:",e.message)}}async function v(d,i,t,g,e,o){if(d.startsWith("/videos/")&&!d.includes("/admin")&&i.method==="GET"){let n=parseInt(d.split("/videos/")[1]);if(!n)return new Response(JSON.stringify({ok:!1,message:"tmdb_id required"}),{status:400,headers:o});try{let{results:c}=await t.DB.prepare("SELECT * FROM title_videos WHERE tmdb_id = ? ORDER BY is_main DESC, created_at DESC").bind(n).all();return c.length===0&&g.waitUntil(Z(n,t)),new Response(JSON.stringify({ok:!0,data:c}),{headers:o})}catch(c){return new Response(JSON.stringify({ok:!1,message:c.message}),{status:500,headers:o})}}if(d==="/admin/videos/crawl"&&i.method==="POST"){if(i.headers.get("Authorization")!==`Bearer ${t.ADMIN_SECRET}`)return new Response(JSON.stringify({ok:!1,message:"Unauthorized"}),{status:401,headers:o});try{let n=await i.json(),{tmdb_id:c}=n;if(!c)return new Response(JSON.stringify({ok:!1,message:"tmdb_id required"}),{status:400,headers:o});let s=await X(parseInt(c),t);return new Response(JSON.stringify({ok:!0,saved:s}),{headers:o})}catch(n){return new Response(JSON.stringify({ok:!1,message:n.message}),{status:500,headers:o})}}if(d==="/admin/videos/batch-crawl"&&i.method==="POST"){if(i.headers.get("Authorization")!==`Bearer ${t.ADMIN_SECRET}`)return new Response(JSON.stringify({ok:!1,message:"Unauthorized"}),{status:401,headers:o});try{let n=20;try{let E=await i.json();E?.limit&&Number.isInteger(E.limit)&&E.limit>0&&(n=E.limit)}catch{}let c=30,r=(await t.DB.prepare("SELECT COUNT(*) AS cnt FROM works WHERE yt_crawl_attempted_at >= date('now')").first())?.cnt||0;if(r>=c){let E=await t.DB.prepare(`
          SELECT COUNT(*) AS cnt
          FROM works w
          WHERE (
            SELECT COUNT(*) FROM title_videos tv WHERE tv.tmdb_id = w.tmdb_id
          ) <= 1
          AND (
            w.yt_crawl_attempted_at IS NULL
            OR w.yt_crawl_attempted_at < datetime('now', '-3 days')
          )
        `).first();return new Response(JSON.stringify({ok:!0,attempted:0,filled:0,remaining:E?.cnt||0,message:`\uC624\uB298 \uC608\uC0B0(${c}\uAC1C) \uC18C\uC9C4 \u2014 \uB0B4\uC77C \uB2E4\uC2DC \uC2DC\uB3C4\uD574\uC8FC\uC138\uC694`}),{headers:o})}let a=Math.min(n,c-r),p=(await t.DB.prepare("SELECT MAX(date) AS latest_date FROM rankings WHERE date != 'manual'").first())?.latest_date||null,{results:_}=await t.DB.prepare(`
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
      `).bind(p,a).all();if(!_.length)return new Response(JSON.stringify({ok:!0,attempted:0,filled:0,remaining:0,message:"\uB300\uC0C1 \uC791\uD488 \uC5C6\uC74C (\uBAA8\uB450 \uCFE8\uB2E4\uC6B4 \uC911\uC774\uAC70\uB098 \uC601\uC0C1\uC774 \uC774\uBBF8 \uCDA9\uBD84\uD568)"}),{headers:o});let f=[],u=0;for(let E of _)try{let w=await Q(E.tmdb_id,t);u+=w,f.push({tmdb_id:E.tmdb_id,saved:w,ok:!0})}catch(w){console.error(`[BATCH_CRAWL] tmdb_id=${E.tmdb_id} \uC624\uB958:`,w.message),f.push({tmdb_id:E.tmdb_id,saved:0,ok:!1,error:w.message})}let k=(await t.DB.prepare(`
        SELECT COUNT(*) AS cnt
        FROM works w
        WHERE (
          SELECT COUNT(*) FROM title_videos tv WHERE tv.tmdb_id = w.tmdb_id
        ) <= 1
        AND (
          w.yt_crawl_attempted_at IS NULL
          OR w.yt_crawl_attempted_at < datetime('now', '-3 days')
        )
      `).first())?.cnt||0;return console.log(`[BATCH_CRAWL] \u2705 \uC644\uB8CC: \uC2DC\uB3C4 ${_.length}\uAC74, \uC800\uC7A5 ${u}\uAC1C, \uB0A8\uC74C ${k}`),new Response(JSON.stringify({ok:!0,attempted:_.length,filled:u,remaining:k,results:f}),{headers:o})}catch(n){return new Response(JSON.stringify({ok:!1,message:n.message}),{status:500,headers:o})}}if(d==="/admin/videos"&&i.method==="POST"){if(i.headers.get("Authorization")!==`Bearer ${t.ADMIN_SECRET}`)return new Response(JSON.stringify({ok:!1,message:"Unauthorized"}),{status:401,headers:o});try{let n=await i.json(),{tmdb_id:c,youtube_url:s}=n,{title:r}=n;if(!c||!s)return new Response(JSON.stringify({ok:!1,message:"tmdb_id, youtube_url required"}),{status:400,headers:o});let a=s.match(/(?:v=|youtu\.be\/|embed\/)([a-zA-Z0-9_-]{11})/);if(!a)return new Response(JSON.stringify({ok:!1,message:"\uC720\uD6A8\uD558\uC9C0 \uC54A\uC740 \uC720\uD29C\uBE0C URL"}),{status:400,headers:o});let l=a[1],p=await t.DB.prepare("SELECT id, title FROM title_videos WHERE tmdb_id = ? AND youtube_id = ? LIMIT 1").bind(c,l).first();if(p)return new Response(JSON.stringify({ok:!1,message:`\uC774\uBBF8 \uB4F1\uB85D\uB41C \uC601\uC0C1\uC785\uB2C8\uB2E4. (\uC81C\uBAA9: "${p.title||l}")`}),{status:409,headers:o});if(!r)try{r=(await(await fetch(`https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${l}&format=json`)).json()).title||""}catch{r=""}return await t.DB.prepare("INSERT INTO title_videos (tmdb_id, youtube_url, youtube_id, title, is_main) VALUES (?, ?, ?, ?, 0)").bind(c,s,l,r).run(),new Response(JSON.stringify({ok:!0}),{headers:o})}catch(n){return new Response(JSON.stringify({ok:!1,message:n.message}),{status:500,headers:o})}}if(d.match(/\/admin\/videos\/(\d+)\/main/)&&i.method==="PATCH"){if(i.headers.get("Authorization")!==`Bearer ${t.ADMIN_SECRET}`)return new Response(JSON.stringify({ok:!1,message:"Unauthorized"}),{status:401,headers:o});let n=parseInt(d.match(/\/admin\/videos\/(\d+)\/main/)[1]);try{let{results:c}=await t.DB.prepare("SELECT tmdb_id FROM title_videos WHERE id = ?").bind(n).all();if(!c.length)return new Response(JSON.stringify({ok:!1,message:"\uC5C6\uC74C"}),{status:404,headers:o});let s=c[0].tmdb_id;return await t.DB.batch([t.DB.prepare("UPDATE title_videos SET is_main = 0 WHERE tmdb_id = ?").bind(s),t.DB.prepare("UPDATE title_videos SET is_main = 1 WHERE id = ?").bind(n)]),new Response(JSON.stringify({ok:!0}),{headers:o})}catch(c){return new Response(JSON.stringify({ok:!1,message:c.message}),{status:500,headers:o})}}if(d.match(/\/admin\/videos\/(\d+)$/)&&i.method==="DELETE"){if(i.headers.get("Authorization")!==`Bearer ${t.ADMIN_SECRET}`)return new Response(JSON.stringify({ok:!1,message:"Unauthorized"}),{status:401,headers:o});let n=parseInt(d.match(/\/admin\/videos\/(\d+)$/)[1]);try{return await t.DB.prepare("DELETE FROM title_videos WHERE id = ?").bind(n).run(),new Response(JSON.stringify({ok:!0}),{headers:o})}catch(c){return new Response(JSON.stringify({ok:!1,message:c.message}),{status:500,headers:o})}}if(d.startsWith("/imdb/")&&d!=="/imdb/save"&&i.method==="GET"){let n=d.split("/imdb/")[1];if(!n||!/^tt\d+$/.test(n))return new Response(JSON.stringify({ok:!1,message:"invalid imdb_id"}),{status:400,headers:o});try{let c=await t.DB.prepare("SELECT imdb_rating, imdb_votes, imdb_updated FROM works WHERE imdb_id = ? LIMIT 1").bind(n).first();if(c?.imdb_rating){let l=new Date(c.imdb_updated||0);if((Date.now()-l.getTime())/(1e3*60*60*24)<7)return new Response(JSON.stringify({ok:!0,source:"cache",rating:c.imdb_rating.toFixed(1),votes:c.imdb_votes||""}),{headers:o})}let s=t.OMDB_API_KEY;if(!s)return new Response(JSON.stringify({ok:!1,message:"OMDB key not configured"}),{status:500,headers:o});let a=await(await fetch(`https://www.omdbapi.com/?i=${n}&apikey=${s}`)).json();if(a.Response!=="False"){let l=parseFloat(a.imdbRating);if(!isNaN(l)){let p=a.imdbVotes||"",_=new Date().toISOString();return await t.DB.prepare("UPDATE works SET imdb_rating = ?, imdb_votes = ?, imdb_updated = ? WHERE imdb_id = ?").bind(l,p,_,n).run(),new Response(JSON.stringify({ok:!0,source:"omdb",rating:l.toFixed(1),votes:p}),{headers:o})}}return new Response(JSON.stringify({ok:!1,message:"rating not available"}),{status:404,headers:o})}catch(c){return console.error("[IMDB GET]",c),new Response(JSON.stringify({ok:!1,message:c.message}),{status:500,headers:o})}}if(d==="/imdb/save"&&i.method==="POST")try{let n=await i.json(),{tmdb_id:c,imdb_id:s}=n;return!c||!s?new Response(JSON.stringify({ok:!1,message:"tmdb_id and imdb_id required"}),{status:400,headers:o}):/^tt\d+$/.test(s)?(await t.DB.prepare("UPDATE works SET imdb_id = ? WHERE tmdb_id = ?").bind(s,parseInt(c)).run(),new Response(JSON.stringify({ok:!0}),{headers:o})):new Response(JSON.stringify({ok:!1,message:"invalid imdb_id format"}),{status:400,headers:o})}catch(n){return console.error("[IMDB SAVE]",n),new Response(JSON.stringify({ok:!1,message:n.message}),{status:500,headers:o})}if(d==="/youtube/trending"&&i.method==="GET")try{let{results:n}=await t.DB.prepare("SELECT * FROM youtube_trending ORDER BY rank ASC").all();if(n.length>0){let _=new Date(n[0].collected_at);if((Date.now()-_.getTime())/(1e3*60*60)<6)return new Response(JSON.stringify({ok:!0,data:n,cached:!0}),{headers:o})}let c=`https://www.googleapis.com/youtube/v3/videos?part=snippet,statistics&chart=mostPopular&regionCode=KR&maxResults=50&key=${t.YOUTUBE_API_KEY}`,s=await fetch(c),r=await s.json();if(!s.ok||!r.items?.length)return n.length>0?new Response(JSON.stringify({ok:!0,data:n,cached:!0}),{headers:o}):new Response(JSON.stringify({ok:!1,message:"YouTube API \uC624\uB958"}),{status:500,headers:o});let a=new Date().toISOString(),l=r.items.map((_,f)=>({rank:f+1,video_id:_.id,title:_.snippet?.title||"",channel:_.snippet?.channelTitle||"",thumbnail:_.snippet?.thumbnails?.medium?.url||_.snippet?.thumbnails?.default?.url||"",view_count:parseInt(_.statistics?.viewCount||0),collected_at:a}));await t.DB.prepare("DELETE FROM youtube_trending").run();let p=l.map(_=>t.DB.prepare(`
          INSERT INTO youtube_trending (rank, video_id, title, channel, thumbnail, view_count, collected_at)
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `).bind(_.rank,_.video_id,_.title,_.channel,_.thumbnail,_.view_count,_.collected_at));return await t.DB.batch(p),new Response(JSON.stringify({ok:!0,data:l,cached:!1}),{headers:o})}catch(n){return new Response(JSON.stringify({ok:!1,message:n.message}),{status:500,headers:o})}if(d==="/works/search"&&i.method==="GET"){let n=e.searchParams.get("q")||"",c=Math.min(parseInt(e.searchParams.get("limit")||"10"),20);if(!n.trim())return new Response(JSON.stringify({ok:!1,message:"q required"}),{status:400,headers:o});let s=n.replace(/\s+/g,"");try{let{results:r}=await t.DB.prepare(`
        SELECT tmdb_id, title_ko, title_en, poster_path, media_type
        FROM works
        WHERE REPLACE(title_ko, ' ', '') LIKE ? OR REPLACE(title_en, ' ', '') LIKE ?
        ORDER BY
          CASE WHEN REPLACE(title_ko, ' ', '') LIKE ? THEN 0 ELSE 1 END,
          title_ko ASC
        LIMIT ?
      `).bind(`%${s}%`,`%${s}%`,`${s}%`,c).all();return new Response(JSON.stringify({ok:!0,data:r}),{headers:o})}catch(r){return new Response(JSON.stringify({ok:!1,message:r.message}),{status:500,headers:o})}}if(d==="/works/register"&&i.method==="POST")try{let n=await i.json(),{tmdb_id:c,title_ko:s,title_en:r,poster_path:a,media_type:l,genre:p,original_language:_,tmdb_rating:f,release_date:u}=n;if(!c||!s)return new Response(JSON.stringify({ok:!1,message:"tmdb_id, title_ko required"}),{status:400,headers:o});let m=r&&/[\uAC00-\uD7A3]/.test(r),E=r&&/[a-zA-Z]/.test(r)&&!m?r:null,w=f??null,y=u||null,O=new Date().toISOString();return await t.DB.prepare(`
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
      `).bind(parseInt(c),s||null,E||null,a||null,l||null,p||null,_||null,w,y,O).run(),new Response(JSON.stringify({ok:!0}),{headers:o})}catch(n){return new Response(JSON.stringify({ok:!1,message:n.message}),{status:500,headers:o})}if(d.startsWith("/works/variety-similar/")&&i.method==="GET"){let n=parseInt(d.split("/works/variety-similar/")[1]);if(!n)return new Response(JSON.stringify({ok:!1,message:"tmdb_id required"}),{status:400,headers:o});let c=Math.min(parseInt(e.searchParams.get("limit")||"10"),20);try{let r=((await t.DB.prepare("SELECT variety_genre FROM works WHERE tmdb_id = ?").bind(n).first())?.variety_genre||"").split(",").map(_=>_.trim()).filter(Boolean);if(!r.length)return new Response(JSON.stringify({ok:!0,data:[]}),{headers:o});let{results:a}=await t.DB.prepare(`
        SELECT tmdb_id, title_ko, title_en, poster_path, tmdb_rating, release_year, variety_genre, media_type
        FROM works
        WHERE variety_genre IS NOT NULL AND variety_genre != '' AND tmdb_id != ?
      `).bind(n).all(),l=new Map;try{let _=await t.DB.prepare("SELECT MAX(date) as d FROM rankings WHERE date != 'manual'").first();if(_?.d){let{results:f}=await t.DB.prepare(`
            SELECT tmdb_id, COUNT(DISTINCT platform) as cnt
            FROM rankings
            WHERE date = ?
            GROUP BY tmdb_id
          `).bind(_.d).all();for(let u of f)l.set(u.tmdb_id,u.cnt)}}catch{}let p=[];for(let _ of a){let f=(_.variety_genre||"").split(",").map(w=>w.trim()).filter(Boolean),u=r.filter(w=>f.includes(w)).length;if(!u)continue;let m=null;if(r.length===2?m=u===2?92:82:r.length===1&&(m=u===1?87:null),!m)continue;let k=l.get(_.tmdb_id)||0,E=Math.min(m+k,99);p.push({tmdb_id:_.tmdb_id,title_ko:_.title_ko,title_en:_.title_en,poster_path:_.poster_path,tmdb_rating:_.tmdb_rating,release_year:_.release_year,match_pct:E,media_type:_.media_type||null})}return p.sort((_,f)=>f.match_pct-_.match_pct||(f.release_year||0)-(_.release_year||0)||(f.tmdb_rating||0)-(_.tmdb_rating||0)),new Response(JSON.stringify({ok:!0,data:p.slice(0,c)}),{headers:o})}catch(s){return new Response(JSON.stringify({ok:!1,message:s.message}),{status:500,headers:o})}}if(d.startsWith("/works/")&&i.method==="GET"){let n=d.split("/works/")[1];if(!n)return new Response(JSON.stringify({ok:!1,message:"tmdb_id required"}),{status:400,headers:o});let{results:c}=await t.DB.prepare("SELECT * FROM works WHERE tmdb_id = ?").bind(parseInt(n)).all();if(!c.length)return new Response(JSON.stringify({ok:!1,message:"Not found"}),{status:404,headers:o});let s={...c[0]};if(!s.mbti_tags&&s.genre){let u=Ot(s.genre);u&&(g.waitUntil(t.DB.prepare("UPDATE works SET mbti_tags = ? WHERE tmdb_id = ?").bind(u,parseInt(n)).run()),s.mbti_tags=u)}let r=7200*60*1e3,a=2400*60*60*1e3,l=!1;try{let{results:u}=await t.DB.prepare(`
        SELECT 1 FROM rankings
        WHERE tmdb_id = ? AND date = (SELECT MAX(date) FROM rankings WHERE date != 'manual')
        LIMIT 1
      `).bind(parseInt(n)).all();l=!!(u&&u.length)}catch{l=!1}let p=l?r:a;if(!s.keyword_preview_updated_at||Date.now()-new Date(s.keyword_preview_updated_at).getTime()>p){let u={keyword:null,items:[]};if(s.keywords&&s.keywords!=="__NONE__"){let k=s.keywords.split(",").map(E=>E.trim()).filter(Boolean).slice(0,10);if(k.length)try{let E=k.map(y=>t.DB.prepare(`
                SELECT w.tmdb_id, w.title_ko, w.title_en, w.poster_path, w.original_language, w.tmdb_rating
                FROM work_keywords wk
                JOIN works w ON w.tmdb_id = wk.tmdb_id
                WHERE wk.keyword = ?
                  AND wk.tmdb_id != ?
                ORDER BY
                  CASE WHEN w.original_language = 'ko' THEN 0 ELSE 1 END,
                  w.tmdb_rating DESC
                LIMIT 20
              `).bind(y.toLowerCase(),parseInt(n))),w=await t.DB.batch(E);for(let y=0;y<k.length;y++){let O=w[y]?.results||[];if(O.length>=3){u={keyword:k[y],items:O};break}}}catch{}}let m=new Date().toISOString();s.keyword_preview=JSON.stringify(u),s.keyword_preview_updated_at=m,g.waitUntil(t.DB.prepare("UPDATE works SET keyword_preview = ?, keyword_preview_updated_at = ? WHERE tmdb_id = ?").bind(s.keyword_preview,m,parseInt(n)).run())}try{let{results:u}=await t.DB.prepare(`
        SELECT w.tmdb_id, w.title_ko, w.title_en, w.poster_path, w.release_year, w.media_type, p.pinned_pct
        FROM work_pinned_similar p
        JOIN works w ON w.tmdb_id = p.related_tmdb_id
        WHERE p.tmdb_id = ?
        ORDER BY p.pinned_pct DESC
      `).bind(parseInt(n)).all();s.pinned_similar=u||[]}catch{s.pinned_similar=[]}if(!s.keyword_ko_map_updated_at||Date.now()-new Date(s.keyword_ko_map_updated_at).getTime()>p){let u={},m=!1;if(s.keywords&&s.keywords!=="__NONE__"){let k=s.keywords.split(",").map(E=>E.trim().toLowerCase()).filter(Boolean);if(k.length)try{let E=k.map(()=>"?").join(","),{results:w}=await t.DB.prepare(`SELECT keyword_en, keyword_ko FROM keyword_translation WHERE keyword_en IN (${E}) AND source = 'admin'`).bind(...k).all();for(let y of w||[])u[y.keyword_en]=y.keyword_ko}catch{m=!0}}if(s.keyword_ko_map=u,!m){let k=new Date().toISOString();g.waitUntil(t.DB.prepare("UPDATE works SET keyword_ko_map = ?, keyword_ko_map_updated_at = ? WHERE tmdb_id = ?").bind(JSON.stringify(u),k,parseInt(n)).run())}}else try{s.keyword_ko_map=s.keyword_ko_map?JSON.parse(s.keyword_ko_map):{}}catch{s.keyword_ko_map={}}return new Response(JSON.stringify({ok:!0,data:s}),{headers:o})}if(d==="/search/keyword"&&i.method==="GET"){let n=(e.searchParams.get("keyword")||"").trim().toLowerCase(),c=Math.min(parseInt(e.searchParams.get("limit")||"20"),40);if(!n)return new Response(JSON.stringify({ok:!1,message:"keyword required"}),{status:400,headers:o});try{let{results:s}=await t.DB.prepare(`
        SELECT w.tmdb_id, w.title_ko, w.title_en, w.poster_path, w.genre, w.tmdb_rating, w.media_type, w.original_language
        FROM work_keywords wk
        JOIN works w ON w.tmdb_id = wk.tmdb_id
        WHERE wk.keyword = ?
        ORDER BY
          CASE WHEN w.original_language = 'ko' THEN 0 ELSE 1 END,
          w.tmdb_rating DESC
        LIMIT ?
      `).bind(n,c).all();return new Response(JSON.stringify({ok:!0,keyword:n,data:s}),{headers:o})}catch(s){return new Response(JSON.stringify({ok:!1,message:s.message}),{status:500,headers:o})}}return null}function Ot(d){if(!d)return null;let i=new Set(["Reality","Talk","News","Soap","Documentary","Kids","\uB2E4\uD050\uBA58\uD130\uB9AC","\uB9AC\uC5BC\uB9AC\uD2F0"]),t=d.split(",").map(a=>a.trim()).filter(Boolean);if(!t.length||!t.filter(a=>!i.has(a)).length)return null;let e=a=>a===0?5:a===1?3:a===2?2:1,o={INTJ:{primary:["Science Fiction","Sci-Fi & Fantasy","SF"],secondary:["Drama","\uB4DC\uB77C\uB9C8","Thriller","\uC2A4\uB9B4\uB7EC"]},INTP:{primary:["Science Fiction","Sci-Fi & Fantasy","SF"],secondary:["Thriller","Mystery","\uC2A4\uB9B4\uB7EC","\uBBF8\uC2A4\uD130\uB9AC"]},ENTJ:{primary:["Drama","\uB4DC\uB77C\uB9C8"],secondary:["Science Fiction","Sci-Fi & Fantasy","SF"]},ENTP:{primary:["Science Fiction","Sci-Fi & Fantasy","SF"],secondary:["Action","Action & Adventure","\uC561\uC158","Adventure","\uBAA8\uD5D8"]},INFJ:{primary:["Thriller","Mystery","\uC2A4\uB9B4\uB7EC","\uBBF8\uC2A4\uD130\uB9AC"],secondary:["Drama","\uB4DC\uB77C\uB9C8","Crime","\uBC94\uC8C4"]},INFP:{primary:["Fantasy","Sci-Fi & Fantasy","\uD310\uD0C0\uC9C0"],secondary:["Drama","\uB4DC\uB77C\uB9C8","Animation","\uC560\uB2C8\uBA54\uC774\uC158"]},ENFJ:{primary:["Fantasy","Sci-Fi & Fantasy","\uD310\uD0C0\uC9C0"],secondary:["Drama","\uB4DC\uB77C\uB9C8","Family","\uAC00\uC871"]},ENFP:{primary:["Drama","\uB4DC\uB77C\uB9C8"],secondary:["Comedy","\uCF54\uBBF8\uB514","Fantasy","\uD310\uD0C0\uC9C0"]},ISTJ:{primary:["Drama","\uB4DC\uB77C\uB9C8"],secondary:["Action","Action & Adventure","\uC561\uC158","History","\uC5ED\uC0AC","War","War & Politics","\uC804\uC7C1"]},ISFJ:{primary:["Comedy","\uCF54\uBBF8\uB514"],secondary:["Romance","\uB85C\uB9E8\uC2A4","Family","\uAC00\uC871","Drama","\uB4DC\uB77C\uB9C8"]},ESTJ:{primary:["Action","Action & Adventure","\uC561\uC158"],secondary:["Drama","\uB4DC\uB77C\uB9C8","History","\uC5ED\uC0AC","War","War & Politics","\uC804\uC7C1"]},ESFJ:{primary:["Action","Action & Adventure","\uC561\uC158"],secondary:["Comedy","\uCF54\uBBF8\uB514","Family","\uAC00\uC871","Romance","\uB85C\uB9E8\uC2A4"]},ISTP:{primary:["Horror","Thriller","\uACF5\uD3EC","\uC2A4\uB9B4\uB7EC"],secondary:["Action","Action & Adventure","\uC561\uC158","Crime","\uBC94\uC8C4"]},ISFP:{primary:["Drama","\uB4DC\uB77C\uB9C8"],secondary:["Animation","\uC560\uB2C8\uBA54\uC774\uC158","Romance","\uB85C\uB9E8\uC2A4","Music","\uC74C\uC545"]},ESTP:{primary:["Action","Action & Adventure","\uC561\uC158"],secondary:["Thriller","Mystery","Crime","\uC2A4\uB9B4\uB7EC","\uBBF8\uC2A4\uD130\uB9AC","\uBC94\uC8C4"]},ESFP:{primary:["Comedy","\uCF54\uBBF8\uB514"],secondary:["Action","Action & Adventure","\uC561\uC158","Romance","\uB85C\uB9E8\uC2A4"]}},n={};for(let[a,l]of Object.entries(o)){let p=0;t.forEach((_,f)=>{let u=e(f);l.primary.includes(_)?p+=u*3:l.secondary.includes(_)&&(p+=u*1)}),p>0&&(n[a]=p)}if(!Object.keys(n).length)return null;let c=parseInt(d.split("").reduce((a,l)=>a+l.charCodeAt(0),0)),s=a=>{let l=Math.sin(c+a*127)*43758.5453;return l-Math.floor(l)},r=Object.entries(n);return r.sort((a,l)=>{if(l[1]!==a[1])return l[1]-a[1];let p=r.indexOf(a),_=r.indexOf(l);return s(p)-s(_)}),r.slice(0,5).map(([a])=>a).join(",")}async function q(d,i,t,g,e){if(d==="/reactions"&&i.method==="GET"){let o=new URL(i.url),n=o.searchParams.get("tmdb_id"),c=o.searchParams.get("featured"),s=parseInt(o.searchParams.get("page")||"1"),r=20,a=(s-1)*r,l,p;c==="1"?(l="SELECT * FROM reactions WHERE is_featured = 1 ORDER BY created_at DESC LIMIT 1",p=[]):n?(l="SELECT * FROM reactions WHERE tmdb_id = ? ORDER BY is_featured DESC, like_count DESC, created_at DESC",p=[parseInt(n)]):(l="SELECT * FROM reactions ORDER BY is_featured DESC, created_at DESC LIMIT ? OFFSET ?",p=[r,a]);let{results:_}=p.length?await t.DB.prepare(l).bind(...p).all():await t.DB.prepare(l).all();return new Response(JSON.stringify({ok:!0,data:_}),{headers:e})}if(d.match(/^\/reactions\/work\/\d+$/)&&i.method==="GET")try{let o=parseInt(d.split("/")[3]),n=["great","good","meh","bad"],{results:c}=await t.DB.prepare(`
        SELECT reaction, COUNT(*) as cnt
        FROM work_reactions
        WHERE tmdb_id = ?
        GROUP BY reaction
      `).bind(o).all(),s=c.reduce((_,f)=>_+f.cnt,0),r={};n.forEach(_=>r[_]=0),c.forEach(_=>{n.includes(_.reaction)&&(r[_.reaction]=_.cnt)});let a={};if(s>0){let _=0,f=n.map(u=>({k:u,raw:r[u]/s*100}));f.forEach((u,m)=>{m<f.length-1?(a[u.k]=Math.round(u.raw),_+=a[u.k]):a[u.k]=100-_})}else n.forEach(_=>a[_]=0);let l=null,p=i.headers.get("Authorization")?.replace("Bearer ","")||(()=>{let f=(i.headers.get("Cookie")||"").match(/session=([^;]+)/);return f?f[1]:null})();if(p){let _=await t.DB.prepare("SELECT user_id FROM sessions WHERE id = ? AND expires_at > datetime('now') LIMIT 1").bind(p).first();_?.user_id&&(l=(await t.DB.prepare("SELECT reaction FROM work_reactions WHERE tmdb_id = ? AND user_id = ? LIMIT 1").bind(o,_.user_id).first())?.reaction||null)}return new Response(JSON.stringify({ok:!0,data:{total:s,counts:r,ratios:a,my_reaction:l}}),{headers:e})}catch(o){return new Response(JSON.stringify({ok:!1,message:o.message}),{status:500,headers:e})}if(d==="/reactions/work"&&i.method==="POST")try{let o=i.headers.get("Authorization")?.replace("Bearer ","")||(()=>{let w=(i.headers.get("Cookie")||"").match(/session=([^;]+)/);return w?w[1]:null})();if(!o)return new Response(JSON.stringify({ok:!1,message:"\uB85C\uADF8\uC778\uC774 \uD544\uC694\uD569\uB2C8\uB2E4"}),{status:401,headers:e});let n=await t.DB.prepare("SELECT user_id FROM sessions WHERE id = ? AND expires_at > datetime('now') LIMIT 1").bind(o).first();if(!n?.user_id)return new Response(JSON.stringify({ok:!1,message:"\uC138\uC158\uC774 \uB9CC\uB8CC\uB410\uC2B5\uB2C8\uB2E4"}),{status:401,headers:e});let c=await i.json(),{tmdb_id:s,reaction:r}=c,a=["great","good","meh","bad"];if(!s||!a.includes(r))return new Response(JSON.stringify({ok:!1,message:"\uC62C\uBC14\uB974\uC9C0 \uC54A\uC740 \uC694\uCCAD\uC785\uB2C8\uB2E4"}),{status:400,headers:e});let l=n.user_id;await t.DB.prepare(`
        INSERT INTO work_reactions (tmdb_id, user_id, reaction, updated_at)
        VALUES (?, ?, ?, datetime('now'))
        ON CONFLICT(tmdb_id, user_id)
        DO UPDATE SET reaction = excluded.reaction, updated_at = datetime('now')
      `).bind(parseInt(s),l,r).run();let{results:p}=await t.DB.prepare(`
        SELECT reaction, COUNT(*) as cnt
        FROM work_reactions
        WHERE tmdb_id = ?
        GROUP BY reaction
      `).bind(parseInt(s)).all(),_=p.reduce((E,w)=>E+w.cnt,0),f={};a.forEach(E=>f[E]=0),p.forEach(E=>{a.includes(E.reaction)&&(f[E.reaction]=E.cnt)});let u={},m=0,k=a.map(E=>({k:E,raw:f[E]/_*100}));return k.forEach((E,w)=>{w<k.length-1?(u[E.k]=Math.round(E.raw),m+=u[E.k]):u[E.k]=100-m}),new Response(JSON.stringify({ok:!0,data:{total:_,counts:f,ratios:u,my_reaction:r}}),{headers:e})}catch(o){return new Response(JSON.stringify({ok:!1,message:o.message}),{status:500,headers:e})}if(d.match(/^\/reactions\/\d+\/comments$/)&&i.method==="GET"){let o=parseInt(d.split("/")[2]),{results:n}=await t.DB.prepare("SELECT * FROM reaction_comments WHERE reaction_id = ? ORDER BY like_count DESC LIMIT 50").bind(o).all();return new Response(JSON.stringify({ok:!0,data:n}),{headers:e})}if(d.match(/^\/reactions\/\d+\/posts$/)&&i.method==="GET"){let o=parseInt(d.split("/")[2]),{results:n}=await t.DB.prepare("SELECT * FROM reaction_posts WHERE reaction_id = ? ORDER BY created_at DESC").bind(o).all();return new Response(JSON.stringify({ok:!0,data:n}),{headers:e})}if(d.match(/^\/reactions\/\d+\/posts$/)&&i.method==="POST")try{let o=parseInt(d.split("/")[2]),n=i.headers.get("Authorization")||"",c=n.startsWith("Bearer ")?n.slice(7).trim():null,s=h(i),r=c||s;if(!r)return new Response(JSON.stringify({ok:!1,message:"\uB85C\uADF8\uC778\uC774 \uD544\uC694\uD569\uB2C8\uB2E4."}),{status:401,headers:e});let a=await t.DB.prepare(`SELECT s.user_id AS id, u.nickname
         FROM sessions s
         JOIN users u ON u.id = s.user_id
         WHERE s.id = ?
         LIMIT 1`).bind(r).first();if(!a)return new Response(JSON.stringify({ok:!1,message:"\uB85C\uADF8\uC778\uC774 \uD544\uC694\uD569\uB2C8\uB2E4."}),{status:401,headers:e});let l=await i.json(),{is_spoiler:p,tmdb_id:_}=l,f=(l.content||"").trim();if(!f)return new Response(JSON.stringify({ok:!1,message:"\uB313\uAE00 \uB0B4\uC6A9\uC744 \uC785\uB825\uD574\uC8FC\uC138\uC694"}),{status:400,headers:e});if(f.length>500)return new Response(JSON.stringify({ok:!1,message:"\uB313\uAE00\uC740 500\uC790 \uC774\uB0B4\uB85C \uC785\uB825\uD574\uC8FC\uC138\uC694"}),{status:400,headers:e});let u=await t.DB.prepare(`
        INSERT INTO reaction_posts (reaction_id, tmdb_id, user_id, nickname, content, is_spoiler)
        VALUES (?, ?, ?, ?, ?, ?)
      `).bind(o,_||0,a.id,a.nickname,f,p?1:0).run();return new Response(JSON.stringify({ok:!0,id:u.meta?.last_row_id,nickname:a.nickname}),{headers:e})}catch(o){return new Response(JSON.stringify({ok:!1,message:o.message}),{status:500,headers:e})}if(d.match(/^\/reactions\/posts\/\d+$/)&&i.method==="DELETE")try{let o=parseInt(d.split("/")[3]),n=i.headers.get("Authorization")||"",c=n.startsWith("Bearer ")?n.slice(7).trim():null,s=h(i),r=c||s;if(!r)return new Response(JSON.stringify({ok:!1,message:"\uB85C\uADF8\uC778\uC774 \uD544\uC694\uD569\uB2C8\uB2E4."}),{status:401,headers:e});let a=await t.DB.prepare("SELECT s.user_id AS id FROM sessions s WHERE s.id = ? LIMIT 1").bind(r).first();if(!a)return new Response(JSON.stringify({ok:!1,message:"\uB85C\uADF8\uC778\uC774 \uD544\uC694\uD569\uB2C8\uB2E4."}),{status:401,headers:e});let l=await t.DB.prepare("SELECT id, user_id FROM reaction_posts WHERE id = ?").bind(o).first();return l?l.user_id!==a.id?new Response(JSON.stringify({ok:!1,message:"\uBCF8\uC778 \uB313\uAE00\uB9CC \uC0AD\uC81C\uD560 \uC218 \uC788\uC2B5\uB2C8\uB2E4."}),{status:403,headers:e}):(await t.DB.prepare("DELETE FROM reaction_posts WHERE id = ?").bind(o).run(),new Response(JSON.stringify({ok:!0}),{headers:e})):new Response(JSON.stringify({ok:!1,message:"\uB313\uAE00\uC744 \uCC3E\uC744 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4."}),{status:404,headers:e})}catch(o){return new Response(JSON.stringify({ok:!1,message:o.message}),{status:500,headers:e})}if(d.match(/^\/reactions\/posts\/\d+\/like$/)&&i.method==="POST")try{let o=parseInt(d.split("/")[3]);return await t.DB.prepare("UPDATE reaction_posts SET like_count = like_count + 1 WHERE id = ?").bind(o).run(),new Response(JSON.stringify({ok:!0}),{headers:e})}catch(o){return new Response(JSON.stringify({ok:!1,message:o.message}),{status:500,headers:e})}if(d==="/admin/reactions"&&i.method==="POST"){if(!b(i,t))return new Response(JSON.stringify({ok:!1,message:"Unauthorized"}),{status:401,headers:e});try{let o=await i.json(),{tmdb_id:n,title_ko:c,poster_path:s,video_id:r,video_title:a,channel_name:l,thumbnail:p,view_count:_,like_count:f,published_at:u,custom_title:m}=o;if(!n||!r)return new Response(JSON.stringify({ok:!1,message:"tmdb_id and video_id required"}),{status:400,headers:e});await t.DB.prepare(`
        INSERT OR REPLACE INTO reactions
          (tmdb_id, title_ko, poster_path, platform, video_id, video_title,
           custom_title, channel_name, thumbnail, view_count, like_count, published_at, is_manual)
        VALUES (?, ?, ?, 'youtube', ?, ?, ?, ?, ?, ?, ?, ?, 1)
      `).bind(parseInt(n),c||"",s||"",r,a||"",m||a||"",l||"",p||"",_||0,f||0,u||new Date().toISOString()).run();let E=(await t.DB.prepare("SELECT id FROM reactions WHERE video_id = ? LIMIT 1").bind(r).first())?.id;return E&&t.YOUTUBE_API_KEY&&t.ANTHROPIC_API_KEY&&g.waitUntil(j(E,r,parseInt(n),t)),new Response(JSON.stringify({ok:!0,reaction_id:E,collecting:!!(E&&t.YOUTUBE_API_KEY),message:t.YOUTUBE_API_KEY?"\uB4F1\uB85D \uC644\uB8CC! \uB313\uAE00 \uC218\uC9D1\xB7\uBC88\uC5ED \uC911 (\uC57D 30\uCD08 \uD6C4 \uD45C\uC2DC)":"\uB4F1\uB85D \uC644\uB8CC"}),{headers:e})}catch(o){return new Response(JSON.stringify({ok:!1,message:o.message}),{status:500,headers:e})}}if(d.match(/^\/admin\/reactions\/\d+\/collect$/)&&i.method==="POST"){if(!b(i,t))return new Response(JSON.stringify({ok:!1,message:"Unauthorized"}),{status:401,headers:e});try{let o=parseInt(d.split("/")[3]),n=await t.DB.prepare("SELECT id, video_id, tmdb_id FROM reactions WHERE id = ? LIMIT 1").bind(o).first();return n?t.YOUTUBE_API_KEY?(g.waitUntil(j(n.id,n.video_id,n.tmdb_id,t)),new Response(JSON.stringify({ok:!0,message:"\uB313\uAE00 \uC218\uC9D1\xB7\uBC88\uC5ED \uC2DC\uC791! \uC57D 30\uCD08 \uD6C4 \uD655\uC778\uD558\uC138\uC694"}),{headers:e})):new Response(JSON.stringify({ok:!1,message:"YOUTUBE_API_KEY not set"}),{status:500,headers:e}):new Response(JSON.stringify({ok:!1,message:"reaction not found"}),{status:404,headers:e})}catch(o){return new Response(JSON.stringify({ok:!1,message:o.message}),{status:500,headers:e})}}if(d.match(/^\/admin\/reactions\/\d+$/)&&i.method==="PATCH"){if(!b(i,t))return new Response(JSON.stringify({ok:!1,message:"Unauthorized"}),{status:401,headers:e});try{let o=parseInt(d.split("/")[3]),n=await i.json(),{custom_title:c,is_featured_off:s}=n;return s?await t.DB.prepare("UPDATE reactions SET is_featured = 0 WHERE id = ?").bind(o).run():await t.DB.prepare("UPDATE reactions SET custom_title = ? WHERE id = ?").bind(c||"",o).run(),new Response(JSON.stringify({ok:!0}),{headers:e})}catch(o){return new Response(JSON.stringify({ok:!1,message:o.message}),{status:500,headers:e})}}if(d.match(/^\/admin\/reactions\/\d+\/featured$/)&&i.method==="PUT"){if(!b(i,t))return new Response(JSON.stringify({ok:!1,message:"Unauthorized"}),{status:401,headers:e});try{let o=parseInt(d.split("/")[3]);return await t.DB.prepare("UPDATE reactions SET is_featured = 0").run(),await t.DB.prepare("UPDATE reactions SET is_featured = 1 WHERE id = ?").bind(o).run(),new Response(JSON.stringify({ok:!0}),{headers:e})}catch(o){return new Response(JSON.stringify({ok:!1,message:o.message}),{status:500,headers:e})}}if(d.match(/^\/admin\/reactions\/\d+$/)&&i.method==="DELETE"){if(!b(i,t))return new Response(JSON.stringify({ok:!1,message:"Unauthorized"}),{status:401,headers:e});try{let o=parseInt(d.split("/")[3]);return await t.DB.prepare("DELETE FROM reactions WHERE id = ?").bind(o).run(),await t.DB.prepare("DELETE FROM reaction_comments WHERE reaction_id = ?").bind(o).run(),await t.DB.prepare("DELETE FROM reaction_posts WHERE reaction_id = ?").bind(o).run(),new Response(JSON.stringify({ok:!0}),{headers:e})}catch(o){return new Response(JSON.stringify({ok:!1,message:o.message}),{status:500,headers:e})}}return null}var x=["\uADC0\uC5EC\uC6B4","\uC6A9\uAC10\uD55C","\uC2E0\uBE44\uB85C\uC6B4","\uC5C9\uB6B1\uD55C","\uC870\uC6A9\uD55C","\uD65C\uBC1C\uD55C","\uB290\uAE0B\uD55C","\uC5F4\uC815\uC801\uC778","\uB0AD\uB9CC\uC801\uC778","\uC9C4\uC9C0\uD55C","\uC720\uCF8C\uD55C","\uB2F9\uB2F9\uD55C","\uC218\uC90D\uC740","\uB3C5\uD2B9\uD55C","\uBE60\uB978","\uB530\uB73B\uD55C","\uCC28\uAC00\uC6B4","\uBC30\uACE0\uD508","\uC878\uB9B0","\uBA4B\uC9C4","\uD669\uB2F9\uD55C","\uC9C4\uC9C0\uD55C","\uB290\uB9B0","\uC601\uB9AC\uD55C","\uAC15\uD55C"];async function tt(d,i,t,g){let e=new URL(i.url);if(d==="/auth/google"&&i.method==="GET"){let o=e.searchParams.get("redirect")||"",n="https://accounts.google.com/o/oauth2/v2/auth?client_id="+t.GOOGLE_CLIENT_ID+"&redirect_uri="+encodeURIComponent("https://ottrank-api.tdidream.workers.dev/auth/google/callback")+"&response_type=code&scope="+encodeURIComponent("openid email profile")+"&access_type=offline"+(o?"&state="+encodeURIComponent(o):"");return Response.redirect(n,302)}if(d==="/auth/google/callback"&&i.method==="GET"){let o=e.searchParams.get("code");if(!o)return Response.redirect("https://ottrank.kr?login=fail",302);try{let c=await(await fetch("https://oauth2.googleapis.com/token",{method:"POST",headers:{"Content-Type":"application/x-www-form-urlencoded"},body:new URLSearchParams({grant_type:"authorization_code",client_id:t.GOOGLE_CLIENT_ID,client_secret:t.GOOGLE_CLIENT_SECRET,redirect_uri:"https://ottrank-api.tdidream.workers.dev/auth/google/callback",code:o})})).json();if(!c.access_token)return Response.redirect("https://ottrank.kr?login=fail",302);let r=await(await fetch("https://www.googleapis.com/oauth2/v2/userinfo",{headers:{Authorization:"Bearer "+c.access_token}})).json(),a=String(r.id),l=r.email||"",p=r.picture||"",_=await t.DB.prepare("SELECT id, nickname FROM users WHERE provider = 'google' AND provider_id = ?").bind(a).first();await t.DB.prepare(`
        INSERT INTO users (provider, provider_id, nickname, email, avatar_url, last_login)
        VALUES ('google', ?, null, ?, ?, datetime('now'))
        ON CONFLICT(provider, provider_id) DO UPDATE SET
          email      = excluded.email,
          avatar_url = excluded.avatar_url,
          last_login = datetime('now')
      `).bind(a,l,p).run();let f=await t.DB.prepare("SELECT id, nickname, last_login_bonus_date FROM users WHERE provider = 'google' AND provider_id = ?").bind(a).first(),u=!_||!_.nickname||_.nickname.trim()==="",m=crypto.randomUUID(),k=new Date(Date.now()+720*60*60*1e3).toISOString();await t.DB.prepare("INSERT INTO sessions (id, user_id, expires_at) VALUES (?, ?, ?)").bind(m,f.id,k).run();let E=e.searchParams.get("state")||"",w=E?decodeURIComponent(E):"";if(!u){let O=new Date(Date.now()+324e5).toISOString().slice(0,10);f.last_login_bonus_date!==O&&(await H(f.id,3,"login",t),await t.DB.prepare("UPDATE users SET last_login_bonus_date = ? WHERE id = ?").bind(O,f.id).run())}let y=u?`https://ottrank.kr/signup.html?sid=${m}`+(w?`&redirect=${encodeURIComponent(w)}`:""):`https://ottrank.kr/mypage.html?sid=${m}`;return new Response(null,{status:302,headers:{Location:y,"Set-Cookie":`session=${m}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${720*60*60}`}})}catch(n){return console.error("[AUTH] \uAD6C\uAE00 \uCF5C\uBC31 \uC624\uB958:",n.message),Response.redirect("https://ottrank.kr?login=fail",302)}}if(d==="/auth/naver"&&i.method==="GET"){let o=e.searchParams.get("redirect")||"",n=o?encodeURIComponent(o):crypto.randomUUID(),c="https://nid.naver.com/oauth2.0/authorize?client_id="+t.NAVER_CLIENT_ID+"&redirect_uri="+encodeURIComponent("https://ottrank-api.tdidream.workers.dev/auth/naver/callback")+"&response_type=code&state="+n;return Response.redirect(c,302)}if(d==="/auth/naver/callback"&&i.method==="GET"){let o=e.searchParams.get("code");if(!o)return Response.redirect("https://ottrank.kr?login=fail",302);try{let c=await(await fetch("https://nid.naver.com/oauth2.0/token",{method:"POST",headers:{"Content-Type":"application/x-www-form-urlencoded"},body:new URLSearchParams({grant_type:"authorization_code",client_id:t.NAVER_CLIENT_ID,client_secret:t.NAVER_CLIENT_SECRET,redirect_uri:"https://ottrank-api.tdidream.workers.dev/auth/naver/callback",code:o,state:e.searchParams.get("state")||""})})).json();if(!c.access_token)return Response.redirect("https://ottrank.kr?login=fail",302);let a=(await(await fetch("https://openapi.naver.com/v1/nid/me",{headers:{Authorization:"Bearer "+c.access_token}})).json()).response,l=String(a.id),p=a.email||"",_=a.profile_image||"",f=await t.DB.prepare("SELECT id, nickname FROM users WHERE provider = 'naver' AND provider_id = ?").bind(l).first();await t.DB.prepare(`
        INSERT INTO users (provider, provider_id, nickname, email, avatar_url, last_login)
        VALUES ('naver', ?, '', ?, ?, datetime('now'))
        ON CONFLICT(provider, provider_id) DO UPDATE SET
          email      = excluded.email,
          avatar_url = excluded.avatar_url,
          last_login = datetime('now')
      `).bind(l,p,_).run();let u=await t.DB.prepare("SELECT id, nickname, last_login_bonus_date FROM users WHERE provider = 'naver' AND provider_id = ?").bind(l).first(),m=!f||!f.nickname||f.nickname.trim()==="",k=crypto.randomUUID(),E=new Date(Date.now()+720*60*60*1e3).toISOString();await t.DB.prepare("INSERT INTO sessions (id, user_id, expires_at) VALUES (?, ?, ?)").bind(k,u.id,E).run();let w=e.searchParams.get("state")||"",y="";try{y=w?decodeURIComponent(w):""}catch{}if(y.startsWith("/")||(y=""),!m){let N=new Date(Date.now()+324e5).toISOString().slice(0,10);u.last_login_bonus_date!==N&&(await H(u.id,3,"login",t),await t.DB.prepare("UPDATE users SET last_login_bonus_date = ? WHERE id = ?").bind(N,u.id).run())}let O=m?`https://ottrank.kr/signup.html?sid=${k}`+(y?`&redirect=${encodeURIComponent(y)}`:""):`https://ottrank.kr/mypage.html?sid=${k}`;return new Response(null,{status:302,headers:{Location:O,"Set-Cookie":`session=${k}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${720*60*60}`}})}catch(n){return console.error("[AUTH] \uB124\uC774\uBC84 \uCF5C\uBC31 \uC624\uB958:",n.message),Response.redirect("https://ottrank.kr?login=fail",302)}}if(d==="/auth/kakao"&&i.method==="GET"){let o=e.searchParams.get("redirect")||"",n=o?encodeURIComponent(o):"",c="https://kauth.kakao.com/oauth/authorize?client_id="+t.KAKAO_CLIENT_ID+"&redirect_uri="+encodeURIComponent("https://ottrank-api.tdidream.workers.dev/auth/kakao/callback")+"&response_type=code"+(n?"&state="+n:"");return Response.redirect(c,302)}if(d==="/auth/kakao/callback"&&i.method==="GET"){let o=e.searchParams.get("code");if(!o)return Response.redirect("https://ottrank.kr?login=fail",302);try{let c=await(await fetch("https://kauth.kakao.com/oauth/token",{method:"POST",headers:{"Content-Type":"application/x-www-form-urlencoded"},body:new URLSearchParams({grant_type:"authorization_code",client_id:t.KAKAO_CLIENT_ID,client_secret:t.KAKAO_CLIENT_SECRET,redirect_uri:"https://ottrank-api.tdidream.workers.dev/auth/kakao/callback",code:o})})).json();if(!c.access_token)return Response.redirect("https://ottrank.kr?login=fail",302);let r=await(await fetch("https://kapi.kakao.com/v2/user/me",{headers:{Authorization:"Bearer "+c.access_token}})).json(),a=String(r.id),l=r.kakao_account?.profile?.profile_image_url||"",p=r.kakao_account?.email||"",_=await t.DB.prepare("SELECT id, nickname FROM users WHERE provider = 'kakao' AND provider_id = ?").bind(a).first();await t.DB.prepare(`
        INSERT INTO users (provider, provider_id, nickname, email, avatar_url, last_login)
        VALUES ('kakao', ?, '', ?, ?, datetime('now'))
        ON CONFLICT(provider, provider_id) DO UPDATE SET
          email      = excluded.email,
          avatar_url = excluded.avatar_url,
          last_login = datetime('now')
      `).bind(a,p,l).run();let f=await t.DB.prepare("SELECT id, nickname, last_login_bonus_date FROM users WHERE provider = 'kakao' AND provider_id = ?").bind(a).first(),u=!_||!_.nickname||_.nickname.trim()==="",m=crypto.randomUUID(),k=new Date(Date.now()+720*60*60*1e3).toISOString();await t.DB.prepare("INSERT INTO sessions (id, user_id, expires_at) VALUES (?, ?, ?)").bind(m,f.id,k).run();let E=e.searchParams.get("state")||"",w=E?decodeURIComponent(E):"";if(!u){let O=new Date(Date.now()+324e5).toISOString().slice(0,10);f.last_login_bonus_date!==O&&(await H(f.id,3,"login",t),await t.DB.prepare("UPDATE users SET last_login_bonus_date = ? WHERE id = ?").bind(O,f.id).run())}let y=u?`https://ottrank.kr/signup.html?sid=${m}`+(w?`&redirect=${encodeURIComponent(w)}`:""):`https://ottrank.kr/mypage.html?sid=${m}`;return new Response(null,{status:302,headers:{Location:y,"Set-Cookie":`session=${m}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${720*60*60}`}})}catch(n){return console.error("[AUTH] \uCE74\uCE74\uC624 \uCF5C\uBC31 \uC624\uB958:",n.message),Response.redirect("https://ottrank.kr?login=fail",302)}}if(d==="/auth/me"&&i.method==="GET")try{let c=(i.headers.get("Authorization")||"").replace("Bearer ","").trim()||h(i);if(!c)return new Response(JSON.stringify({ok:!1}),{headers:g});let s=await t.DB.prepare("SELECT * FROM sessions WHERE id = ? AND expires_at > datetime('now')").bind(c).first();if(!s)return new Response(JSON.stringify({ok:!1}),{headers:g});let r=await t.DB.prepare("SELECT id, nickname, email, avatar_url, provider, grade, total_likes_received, mbti, ott_points, created_at, last_login_bonus_date FROM users WHERE id = ?").bind(s.user_id).first();if(!r)return new Response(JSON.stringify({ok:!1}),{headers:g});let a=new Date(Date.now()+540*60*1e3).toISOString().slice(0,10);r.last_login_bonus_date!==a&&(await H(r.id,3,"login",t),await t.DB.prepare("UPDATE users SET last_login_bonus_date = ? WHERE id = ?").bind(a,r.id).run(),r.ott_points=(r.ott_points||0)+3,r.last_login_bonus_date=a);let l=await t.DB.prepare("SELECT grade_name, grade_key, emoji_url, sort_order FROM grade_settings WHERE grade_key = ?").bind(r.grade||"rookie").first();return new Response(JSON.stringify({ok:!0,user:{...r,gradeInfo:l||null}}),{headers:g})}catch{return new Response(JSON.stringify({ok:!1}),{headers:g})}if(d==="/auth/random-nickname"&&i.method==="GET")try{let n=(await t.DB.prepare(`
        SELECT title_ko FROM works
        WHERE title_ko IS NOT NULL
          AND title_ko != ''
          AND length(title_ko) <= 10
        ORDER BY RANDOM()
        LIMIT 1
      `).first())?.title_ko||"\uB4DC\uB77C\uB9C8\uD32C",c=x[Math.floor(Math.random()*x.length)],s=Math.floor(Math.random()*9e3)+1e3,r=`${c}${n}${s}`;return r.length>20&&(r=`${c}${n.slice(0,6)}${s}`),new Response(JSON.stringify({ok:!0,nickname:r}),{headers:g})}catch{let n=x[Math.floor(Math.random()*x.length)],c=Math.floor(Math.random()*9e3)+1e3;return new Response(JSON.stringify({ok:!0,nickname:`${n}\uC2DC\uB124\uB9C8${c}`}),{headers:g})}if(d==="/auth/nickname"&&i.method==="POST")try{let o=await i.json(),{nickname:n,sid:c,mbti:s}=o,r=c||h(i);if(!r)return new Response(JSON.stringify({ok:!1,message:"\uB85C\uADF8\uC778\uC774 \uD544\uC694\uD574\uC694"}),{status:401,headers:g});let a=await t.DB.prepare("SELECT * FROM sessions WHERE id = ? AND expires_at > datetime('now')").bind(r).first();if(!a)return new Response(JSON.stringify({ok:!1,message:"\uC138\uC158\uC774 \uB9CC\uB8CC\uB410\uC5B4\uC694"}),{status:401,headers:g});if(!n||n.trim().length<2)return new Response(JSON.stringify({ok:!1,message:"\uB2C9\uB124\uC784\uC740 2\uC790 \uC774\uC0C1 \uC785\uB825\uD574\uC8FC\uC138\uC694"}),{status:400,headers:g});if(n.trim().length>20)return new Response(JSON.stringify({ok:!1,message:"\uB2C9\uB124\uC784\uC740 20\uC790 \uC774\uB0B4\uB85C \uC785\uB825\uD574\uC8FC\uC138\uC694"}),{status:400,headers:g});if(!/^[가-힣a-zA-Z0-9]+$/.test(n.trim()))return new Response(JSON.stringify({ok:!1,message:"\uD55C\uAE00, \uC601\uBB38, \uC22B\uC790\uB9CC \uC0AC\uC6A9\uD560 \uC218 \uC788\uC5B4\uC694"}),{status:400,headers:g});if(await t.DB.prepare("SELECT id FROM users WHERE nickname = ? AND id != ?").bind(n.trim(),a.user_id).first())return new Response(JSON.stringify({ok:!1,message:"\uC774\uBBF8 \uC0AC\uC6A9 \uC911\uC778 \uB2C9\uB124\uC784\uC774\uC5D0\uC694"}),{status:400,headers:g});let _=s&&["INTJ","INTP","ENTJ","ENTP","INFJ","INFP","ENFJ","ENFP","ISTJ","ISFJ","ESTJ","ESFJ","ISTP","ISFP","ESTP","ESFP"].includes(s)?s:null;return await t.DB.prepare("UPDATE users SET nickname = ?, mbti = ? WHERE id = ?").bind(n.trim(),_,a.user_id).run(),await t.DB.prepare("SELECT id FROM user_point_logs WHERE user_id = ? AND reason = 'signup' LIMIT 1").bind(a.user_id).first()||await H(a.user_id,30,"signup",t),_&&(await t.DB.prepare("SELECT id FROM user_point_logs WHERE user_id = ? AND reason = 'mbti_register' LIMIT 1").bind(a.user_id).first()||await H(a.user_id,20,"mbti_register",t)),new Response(JSON.stringify({ok:!0}),{headers:g})}catch(o){return new Response(JSON.stringify({ok:!1,message:o.message}),{status:500,headers:g})}if(d==="/auth/nickname"&&i.method==="PUT")try{let n=(i.headers.get("Authorization")||"").replace("Bearer ","").trim()||h(i);if(!n)return new Response(JSON.stringify({ok:!1,message:"\uB85C\uADF8\uC778 \uD544\uC694"}),{status:401,headers:g});let c=await t.DB.prepare("SELECT * FROM sessions WHERE id = ? AND expires_at > datetime('now')").bind(n).first();if(!c)return new Response(JSON.stringify({ok:!1,message:"\uC138\uC158 \uB9CC\uB8CC"}),{status:401,headers:g});let s=await i.json(),{nickname:r}=s;return!r||r.trim().length<2?new Response(JSON.stringify({ok:!1,message:"\uB2C9\uB124\uC784\uC740 2\uC790 \uC774\uC0C1 \uC785\uB825\uD574\uC8FC\uC138\uC694"}),{status:400,headers:g}):r.trim().length>20?new Response(JSON.stringify({ok:!1,message:"\uB2C9\uB124\uC784\uC740 20\uC790 \uC774\uB0B4\uB85C \uC785\uB825\uD574\uC8FC\uC138\uC694"}),{status:400,headers:g}):/^[가-힣a-zA-Z0-9]+$/.test(r.trim())?await t.DB.prepare("SELECT id FROM users WHERE nickname = ? AND id != ?").bind(r.trim(),c.user_id).first()?new Response(JSON.stringify({ok:!1,message:"\uC774\uBBF8 \uC0AC\uC6A9 \uC911\uC778 \uB2C9\uB124\uC784\uC774\uC5D0\uC694"}),{status:400,headers:g}):(await t.DB.prepare("UPDATE users SET nickname = ? WHERE id = ?").bind(r.trim(),c.user_id).run(),new Response(JSON.stringify({ok:!0}),{headers:g})):new Response(JSON.stringify({ok:!1,message:"\uD55C\uAE00, \uC601\uBB38, \uC22B\uC790\uB9CC \uC0AC\uC6A9\uD560 \uC218 \uC788\uC5B4\uC694"}),{status:400,headers:g})}catch(o){return new Response(JSON.stringify({ok:!1,message:o.message}),{status:500,headers:g})}if(d==="/auth/withdraw"&&i.method==="DELETE")try{let n=(i.headers.get("Authorization")||"").replace("Bearer ","").trim()||h(i);if(!n)return new Response(JSON.stringify({ok:!1,message:"\uB85C\uADF8\uC778 \uD544\uC694"}),{status:401,headers:g});let c=await t.DB.prepare("SELECT user_id FROM sessions WHERE id = ? AND expires_at > datetime('now')").bind(n).first();if(!c)return new Response(JSON.stringify({ok:!1,message:"\uC138\uC158 \uB9CC\uB8CC"}),{status:401,headers:g});let s=c.user_id;return await t.DB.prepare("DELETE FROM sessions  WHERE user_id = ?").bind(s).run(),await t.DB.prepare("DELETE FROM wishlist  WHERE user_id = ?").bind(s).run(),await t.DB.prepare("DELETE FROM reviews   WHERE user_id = ?").bind(s).run(),await t.DB.prepare("DELETE FROM posts     WHERE user_id = ?").bind(s).run(),await t.DB.prepare("DELETE FROM users     WHERE id = ?").bind(s).run(),new Response(JSON.stringify({ok:!0}),{headers:{...g,"Set-Cookie":"session=; Path=/; HttpOnly; Secure; Max-Age=0"}})}catch(o){return new Response(JSON.stringify({ok:!1,message:o.message}),{status:500,headers:g})}if(d==="/auth/mbti"&&i.method==="PATCH")try{let n=(i.headers.get("Authorization")||"").replace("Bearer ","").trim()||h(i);if(!n)return new Response(JSON.stringify({ok:!1,message:"\uB85C\uADF8\uC778 \uD544\uC694"}),{status:401,headers:g});let c=await t.DB.prepare("SELECT * FROM sessions WHERE id = ? AND expires_at > datetime('now')").bind(n).first();if(!c)return new Response(JSON.stringify({ok:!1,message:"\uC138\uC158 \uB9CC\uB8CC"}),{status:401,headers:g});let s=await i.json(),{mbti:r}=s,l=r&&["INTJ","INTP","ENTJ","ENTP","INFJ","INFP","ENFJ","ENFP","ISTJ","ISFJ","ESTJ","ESFJ","ISTP","ISFP","ESTP","ESFP"].includes(r)?r:null,p=await t.DB.prepare("SELECT mbti FROM users WHERE id = ?").bind(c.user_id).first();await t.DB.prepare("UPDATE users SET mbti = ? WHERE id = ?").bind(l,c.user_id).run();let _=!!p?.mbti,f=!!l;return!_&&f?await t.DB.prepare("SELECT id FROM user_point_logs WHERE user_id = ? AND reason = 'mbti_register' LIMIT 1").bind(c.user_id).first()||await H(c.user_id,20,"mbti_register",t):_&&!f&&await H(c.user_id,-20,"mbti_unregister",t),new Response(JSON.stringify({ok:!0,mbti:l}),{headers:g})}catch(o){return new Response(JSON.stringify({ok:!1,message:o.message}),{status:500,headers:g})}if(d==="/auth/logout"&&i.method==="POST")try{let c=(i.headers.get("Authorization")||"").replace("Bearer ","").trim()||h(i);return c&&await t.DB.prepare("DELETE FROM sessions WHERE id = ?").bind(c).run(),new Response(JSON.stringify({ok:!0}),{headers:{...g,"Set-Cookie":"session=; Path=/; HttpOnly; Secure; Max-Age=0"}})}catch(o){return new Response(JSON.stringify({ok:!1,message:o.message}),{status:500,headers:g})}return null}async function et(d,i,t,g,e){if(d==="/wishlist"&&i.method==="GET")try{let c=(i.headers.get("Authorization")||"").replace("Bearer ","").trim()||h(i);if(!c)return new Response(JSON.stringify({ok:!1,message:"\uB85C\uADF8\uC778 \uD544\uC694"}),{status:401,headers:e});let s=await t.DB.prepare("SELECT user_id FROM sessions WHERE id = ? AND expires_at > datetime('now')").bind(c).first();if(!s)return new Response(JSON.stringify({ok:!1}),{status:401,headers:e});let{results:r}=await t.DB.prepare("SELECT * FROM wishlist WHERE user_id = ? ORDER BY created_at DESC").bind(s.user_id).all();return new Response(JSON.stringify({ok:!0,data:r}),{headers:e})}catch(n){return new Response(JSON.stringify({ok:!1,message:n.message}),{status:500,headers:e})}if(d==="/wishlist"&&i.method==="POST")try{let c=(i.headers.get("Authorization")||"").replace("Bearer ","").trim()||h(i);if(!c)return new Response(JSON.stringify({ok:!1,message:"\uB85C\uADF8\uC778 \uD544\uC694"}),{status:401,headers:e});let s=await t.DB.prepare("SELECT user_id FROM sessions WHERE id = ? AND expires_at > datetime('now')").bind(c).first();if(!s)return new Response(JSON.stringify({ok:!1,message:"\uC138\uC158 \uB9CC\uB8CC"}),{status:401,headers:e});let r=await i.json(),{tmdb_id:a,title_ko:l,poster_path:p,release_year:_,category:f}=r;return a?await t.DB.prepare("SELECT id FROM wishlist WHERE user_id = ? AND tmdb_id = ?").bind(s.user_id,parseInt(a)).first()?(await t.DB.prepare("DELETE FROM wishlist WHERE user_id = ? AND tmdb_id = ?").bind(s.user_id,parseInt(a)).run(),g.waitUntil(F(s.user_id,t)),new Response(JSON.stringify({ok:!0,wishlisted:!1}),{headers:e})):(await t.DB.prepare("INSERT INTO wishlist (user_id, tmdb_id, title_ko, poster_path, release_year, category) VALUES (?, ?, ?, ?, ?, ?)").bind(s.user_id,parseInt(a),l||"",p||"",_||"",f||"movie").run(),g.waitUntil(H(s.user_id,1,"wishlist",t)),g.waitUntil(F(s.user_id,t)),new Response(JSON.stringify({ok:!0,wishlisted:!0}),{headers:e})):new Response(JSON.stringify({ok:!1,message:"tmdb_id \uD544\uC694"}),{status:400,headers:e})}catch(n){return new Response(JSON.stringify({ok:!1,message:n.message}),{status:500,headers:e})}if(d.match(/^\/wishlist\/check\/\d+$/)&&i.method==="GET")try{let n=parseInt(d.split("/")[3]),s=(i.headers.get("Authorization")||"").replace("Bearer ","").trim()||h(i);if(!s)return new Response(JSON.stringify({ok:!0,wishlisted:!1}),{headers:e});let r=await t.DB.prepare("SELECT user_id FROM sessions WHERE id = ? AND expires_at > datetime('now')").bind(s).first();if(!r)return new Response(JSON.stringify({ok:!0,wishlisted:!1}),{headers:e});let a=await t.DB.prepare("SELECT id FROM wishlist WHERE user_id = ? AND tmdb_id = ?").bind(r.user_id,n).first();return new Response(JSON.stringify({ok:!0,wishlisted:!!a}),{headers:e})}catch{return new Response(JSON.stringify({ok:!0,wishlisted:!1}),{headers:e})}if(d.match(/^\/reviews\/\d+$/)&&i.method==="GET")try{let n=parseInt(d.split("/")[2]),s=(i.headers.get("Authorization")||"").replace("Bearer ","").trim()||h(i),r=-1;if(s){let l=await t.DB.prepare("SELECT user_id FROM sessions WHERE id = ? AND expires_at > datetime('now')").bind(s).first();l&&(r=l.user_id)}let{results:a}=await t.DB.prepare(`
        SELECT r.*, u.nickname, u.provider, u.grade, u.mbti,
          gs.emoji_url as grade_emoji_url, gs.grade_name,
          CASE WHEN rl.id IS NOT NULL THEN 1 ELSE 0 END AS liked_by_me
        FROM reviews r
        JOIN users u ON r.user_id = u.id
        LEFT JOIN grade_settings gs ON gs.grade_key = u.grade
        LEFT JOIN review_likes rl ON rl.review_id = r.id AND rl.user_id = ? AND rl.is_active = 1
        WHERE r.tmdb_id = ?
        ORDER BY r.likes DESC, r.created_at DESC
      `).bind(r,n).all();return new Response(JSON.stringify({ok:!0,data:a}),{headers:e})}catch(n){return new Response(JSON.stringify({ok:!1,message:n.message}),{status:500,headers:e})}if(d.match(/^\/reviews\/\d+\/me$/)&&i.method==="GET")try{let n=parseInt(d.split("/")[2]),s=(i.headers.get("Authorization")||"").replace("Bearer ","").trim()||h(i);if(!s)return new Response(JSON.stringify({ok:!0,data:null}),{headers:e});let r=await t.DB.prepare("SELECT user_id FROM sessions WHERE id = ? AND expires_at > datetime('now')").bind(s).first();if(!r)return new Response(JSON.stringify({ok:!0,data:null}),{headers:e});let a=await t.DB.prepare("SELECT * FROM reviews WHERE tmdb_id = ? AND user_id = ?").bind(n,r.user_id).first();return new Response(JSON.stringify({ok:!0,data:a||null}),{headers:e})}catch(n){return new Response(JSON.stringify({ok:!1,message:n.message}),{status:500,headers:e})}if(d.match(/^\/reviews\/\d+$/)&&i.method==="POST")try{let n=parseInt(d.split("/")[2]),s=(i.headers.get("Authorization")||"").replace("Bearer ","").trim()||h(i);if(!s)return new Response(JSON.stringify({ok:!1,message:"\uB85C\uADF8\uC778 \uD544\uC694"}),{status:401,headers:e});let r=await t.DB.prepare("SELECT user_id FROM sessions WHERE id = ? AND expires_at > datetime('now')").bind(s).first();if(!r)return new Response(JSON.stringify({ok:!1,message:"\uC138\uC158 \uB9CC\uB8CC"}),{status:401,headers:e});let a=await i.json(),{score:l,emotions:p,custom_tags:_,text:f,spoiler:u}=a;if(!l||l<.5||l>10)return new Response(JSON.stringify({ok:!1,message:"\uBCC4\uC810\uC744 \uC120\uD0DD\uD574\uC8FC\uC138\uC694 (0.5~10)"}),{status:400,headers:e});let k=!await t.DB.prepare("SELECT id FROM reviews WHERE tmdb_id = ? AND user_id = ?").bind(n,r.user_id).first();return await t.DB.prepare(`
        INSERT INTO reviews (tmdb_id, user_id, score, emotions, custom_tags, text, spoiler)
        VALUES (?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(tmdb_id, user_id) DO UPDATE SET
          score       = excluded.score,
          emotions    = excluded.emotions,
          custom_tags = excluded.custom_tags,
          text        = excluded.text,
          spoiler     = excluded.spoiler,
          created_at  = datetime('now')
      `).bind(n,r.user_id,l,JSON.stringify(p||[]),JSON.stringify(_||[]),(f||"").slice(0,500),u?1:0).run(),k&&g.waitUntil(H(r.user_id,10,"review",t)),g.waitUntil(F(r.user_id,t)),new Response(JSON.stringify({ok:!0}),{headers:e})}catch(n){return new Response(JSON.stringify({ok:!1,message:n.message}),{status:500,headers:e})}if(d.match(/^\/reviews\/\d+\/like\/\d+$/)&&i.method==="POST")try{let n=parseInt(d.split("/")[4]),s=(i.headers.get("Authorization")||"").replace("Bearer ","").trim()||h(i);if(!s)return new Response(JSON.stringify({ok:!1,message:"\uB85C\uADF8\uC778 \uD544\uC694"}),{status:401,headers:e});let r=await t.DB.prepare("SELECT user_id FROM sessions WHERE id = ? AND expires_at > datetime('now')").bind(s).first();if(!r)return new Response(JSON.stringify({ok:!1,message:"\uC138\uC158 \uB9CC\uB8CC"}),{status:401,headers:e});let a=await t.DB.prepare("SELECT user_id FROM reviews WHERE id = ?").bind(n).first();if(!a)return new Response(JSON.stringify({ok:!1,message:"\uB9AC\uBDF0\uB97C \uCC3E\uC744 \uC218 \uC5C6\uC5B4\uC694"}),{status:404,headers:e});let l=await t.DB.prepare("SELECT id, is_active FROM review_likes WHERE review_id = ? AND user_id = ?").bind(n,r.user_id).first(),p;l?l.is_active?(await t.DB.prepare("UPDATE review_likes SET is_active = 0 WHERE id = ?").bind(l.id).run(),await t.DB.prepare("UPDATE reviews SET likes = MAX(0, likes - 1) WHERE id = ?").bind(n).run(),a.user_id&&await t.DB.prepare("UPDATE users SET total_likes_received = MAX(0, total_likes_received - 1) WHERE id = ?").bind(a.user_id).run(),p=!1):(await t.DB.prepare("UPDATE review_likes SET is_active = 1 WHERE id = ?").bind(l.id).run(),await t.DB.prepare("UPDATE reviews SET likes = likes + 1 WHERE id = ?").bind(n).run(),a.user_id&&await t.DB.prepare("UPDATE users SET total_likes_received = total_likes_received + 1 WHERE id = ?").bind(a.user_id).run(),p=!0):(await t.DB.prepare("INSERT INTO review_likes (review_id, user_id, is_active) VALUES (?, ?, 1)").bind(n,r.user_id).run(),await t.DB.prepare("UPDATE reviews SET likes = likes + 1 WHERE id = ?").bind(n).run(),a.user_id&&(await t.DB.prepare("UPDATE users SET total_likes_received = total_likes_received + 1 WHERE id = ?").bind(a.user_id).run(),g.waitUntil(H(a.user_id,1,"like_received",t)),g.waitUntil(F(a.user_id,t))),p=!0);let _=await t.DB.prepare("SELECT likes FROM reviews WHERE id = ?").bind(n).first();return new Response(JSON.stringify({ok:!0,liked:p,likes:_?.likes??0}),{headers:e})}catch(n){return new Response(JSON.stringify({ok:!1,message:n.message}),{status:500,headers:e})}if(d.match(/^\/reviews\/\d+$/)&&i.method==="DELETE")try{let n=parseInt(d.split("/")[2]),s=(i.headers.get("Authorization")||"").replace("Bearer ","").trim()||h(i);if(!s)return new Response(JSON.stringify({ok:!1,message:"\uB85C\uADF8\uC778 \uD544\uC694"}),{status:401,headers:e});let r=await t.DB.prepare("SELECT user_id FROM sessions WHERE id = ? AND expires_at > datetime('now')").bind(s).first();return r?(await t.DB.prepare("DELETE FROM reviews WHERE tmdb_id = ? AND user_id = ?").bind(n,r.user_id).run(),g.waitUntil(F(r.user_id,t)),new Response(JSON.stringify({ok:!0}),{headers:e})):new Response(JSON.stringify({ok:!1,message:"\uC138\uC158 \uB9CC\uB8CC"}),{status:401,headers:e})}catch(n){return new Response(JSON.stringify({ok:!1,message:n.message}),{status:500,headers:e})}if(d==="/mypage"&&i.method==="GET")try{let c=(i.headers.get("Authorization")||"").replace("Bearer ","").trim()||h(i);if(!c)return new Response(JSON.stringify({ok:!1,message:"\uB85C\uADF8\uC778 \uD544\uC694"}),{status:401,headers:e});let s=await t.DB.prepare("SELECT user_id FROM sessions WHERE id = ? AND expires_at > datetime('now')").bind(c).first();if(!s)return new Response(JSON.stringify({ok:!1,message:"\uC138\uC158 \uB9CC\uB8CC"}),{status:401,headers:e});let r=s.user_id,[a,l,p,_,f,u,m,k]=await t.DB.batch([t.DB.prepare(`
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
        `).bind(r),t.DB.prepare("SELECT grade_key, grade_name, min_ott_points, emoji_url, is_special, sort_order FROM grade_settings ORDER BY sort_order ASC")]),E=a.results[0]||null,w=l.results,y=p.results,O=_.results,N=f.results,R=u.results,D=m.results,S=k.results,T=[];if(R.length){let L=await t.DB.batch(R.map(C=>t.DB.prepare("SELECT * FROM pick_list_works WHERE pick_list_id = ? ORDER BY sort_order ASC, created_at DESC").bind(C.id)));T=R.map((C,I)=>{let B=L[I].results;return{...C,works:B,work_count:B.length}})}return new Response(JSON.stringify({ok:!0,is_own:!0,user:E,reviews:w,wishlist:y,posts:O,life_works:N,pick_lists:T,recent_point_logs:D,grade_settings:S,stats:{review_count:w.length,wishlist_count:y.length,likes_received:E?.total_likes_received||0,post_count:O.length,life_work_count:N.length,pick_list_count:T.length}}),{headers:e})}catch(n){return new Response(JSON.stringify({ok:!1,message:n.message}),{status:500,headers:e})}if(d==="/mypage/summary"&&i.method==="GET")try{let c=(i.headers.get("Authorization")||"").replace("Bearer ","").trim()||h(i);if(!c)return new Response(JSON.stringify({ok:!1,message:"\uB85C\uADF8\uC778 \uD544\uC694"}),{status:401,headers:e});let s=await t.DB.prepare("SELECT user_id FROM sessions WHERE id = ? AND expires_at > datetime('now')").bind(c).first();if(!s)return new Response(JSON.stringify({ok:!1,message:"\uC138\uC158 \uB9CC\uB8CC"}),{status:401,headers:e});let r=await t.DB.prepare(`
        SELECT u.id, u.nickname, u.grade, u.ott_points,
          gs.grade_name, gs.emoji_url as grade_emoji_url, gs.sort_order as grade_order,
          gs.is_special as grade_is_special
        FROM users u
        LEFT JOIN grade_settings gs ON gs.grade_key = u.grade
        WHERE u.id = ?
      `).bind(s.user_id).first();return new Response(JSON.stringify({ok:!0,user:r}),{headers:e})}catch(n){return new Response(JSON.stringify({ok:!1,message:n.message}),{status:500,headers:e})}if(d==="/mypage/point-logs"&&i.method==="GET")try{let c=(i.headers.get("Authorization")||"").replace("Bearer ","").trim()||h(i);if(!c)return new Response(JSON.stringify({ok:!1,message:"\uB85C\uADF8\uC778 \uD544\uC694"}),{status:401,headers:e});let s=await t.DB.prepare("SELECT user_id FROM sessions WHERE id = ? AND expires_at > datetime('now')").bind(c).first();if(!s)return new Response(JSON.stringify({ok:!1,message:"\uC138\uC158 \uB9CC\uB8CC"}),{status:401,headers:e});let r=new URL(i.url).searchParams,a=Math.max(1,parseInt(r.get("page")||"1")),l=Math.min(50,Math.max(1,parseInt(r.get("limit")||"10"))),p=(a-1)*l,[_,f]=await t.DB.batch([t.DB.prepare("SELECT COUNT(*) AS total FROM user_point_logs WHERE user_id = ?").bind(s.user_id),t.DB.prepare(`
          SELECT points, reason, created_at
          FROM user_point_logs
          WHERE user_id = ?
          ORDER BY created_at DESC
          LIMIT ? OFFSET ?
        `).bind(s.user_id,l,p)]),u=_.results[0]?.total||0,m=f.results;return new Response(JSON.stringify({ok:!0,logs:m,total:u,page:a,limit:l}),{headers:e})}catch(n){return new Response(JSON.stringify({ok:!1,message:n.message}),{status:500,headers:e})}if(d==="/mypage/wishlist-public"&&i.method==="PATCH")try{let c=(i.headers.get("Authorization")||"").replace("Bearer ","").trim()||h(i);if(!c)return new Response(JSON.stringify({ok:!1,message:"\uB85C\uADF8\uC778 \uD544\uC694"}),{status:401,headers:e});let s=await t.DB.prepare("SELECT user_id FROM sessions WHERE id = ? AND expires_at > datetime('now')").bind(c).first();if(!s)return new Response(JSON.stringify({ok:!1,message:"\uC138\uC158 \uB9CC\uB8CC"}),{status:401,headers:e});let a=(await i.json()).wishlist_public?1:0;return await t.DB.prepare("UPDATE users SET wishlist_public = ? WHERE id = ?").bind(a,s.user_id).run(),new Response(JSON.stringify({ok:!0,wishlist_public:a}),{headers:e})}catch(n){return new Response(JSON.stringify({ok:!1,message:n.message}),{status:500,headers:e})}if(d.match(/^\/user\/\d+$/)&&i.method==="GET")try{let n=parseInt(d.split("/")[2]),c=await t.DB.prepare(`
        SELECT u.id, u.nickname, u.grade, u.total_likes_received, u.created_at,
          u.wishlist_public, u.mbti,
          gs.grade_name, gs.emoji_url as grade_emoji_url, gs.is_special as grade_is_special
        FROM users u
        LEFT JOIN grade_settings gs ON gs.grade_key = u.grade
        WHERE u.id = ?
      `).bind(n).first();if(!c)return new Response(JSON.stringify({ok:!1,message:"\uC720\uC800\uB97C \uCC3E\uC744 \uC218 \uC5C6\uC5B4\uC694"}),{status:404,headers:e});let{results:s}=await t.DB.prepare(`
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
      `).bind(n,n).all(),r=[];if(c.wishlist_public){let{results:f}=await t.DB.prepare(`
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
        `).bind(n,n).all();r=f}let{results:a}=await t.DB.prepare(`
        SELECT id, board_type, title, like_count, view_count, created_at
        FROM posts WHERE user_id = ? AND is_hidden = 0 ORDER BY created_at DESC
      `).bind(n).all(),{results:l}=await t.DB.prepare(`
        SELECT lw.*,
          COALESCE(wk.poster_path, lw.poster_path) as poster_path,
          COALESCE(wk.title_ko, lw.title_ko) as title_ko
        FROM life_works lw
        LEFT JOIN works wk ON wk.tmdb_id = lw.tmdb_id
        WHERE lw.user_id = ?
        ORDER BY lw.created_at DESC
      `).bind(n).all(),{results:p}=await t.DB.prepare("SELECT * FROM pick_lists WHERE user_id = ? AND is_public = 1 ORDER BY created_at DESC").bind(n).all(),_=await Promise.all(p.map(async f=>{let{results:u}=await t.DB.prepare("SELECT * FROM pick_list_works WHERE pick_list_id = ? ORDER BY sort_order ASC, created_at DESC").bind(f.id).all();return{...f,works:u,work_count:u.length}}));return new Response(JSON.stringify({ok:!0,is_own:!1,user:c,reviews:s,wishlist:r,wishlist_hidden:!c.wishlist_public,posts:a,life_works:l,pick_lists:_,stats:{review_count:s.length,wishlist_count:c.wishlist_public?r.length:null,likes_received:c.total_likes_received||0,post_count:a.length,life_work_count:l.length,pick_list_count:_.length}}),{headers:e})}catch(n){return new Response(JSON.stringify({ok:!1,message:n.message}),{status:500,headers:e})}if(d==="/mypage/reviews"&&i.method==="GET")try{let c=(i.headers.get("Authorization")||"").replace("Bearer ","").trim()||h(i);if(!c)return new Response(JSON.stringify({ok:!1,message:"\uB85C\uADF8\uC778 \uD544\uC694"}),{status:401,headers:e});let s=await t.DB.prepare("SELECT user_id FROM sessions WHERE id = ? AND expires_at > datetime('now')").bind(c).first();if(!s)return new Response(JSON.stringify({ok:!1,message:"\uC138\uC158 \uB9CC\uB8CC"}),{status:401,headers:e});let r=await t.DB.prepare("SELECT nickname FROM users WHERE id = ?").bind(s.user_id).first(),{results:a}=await t.DB.prepare(`
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
      `).bind(s.user_id,s.user_id).all();return new Response(JSON.stringify({ok:!0,reviews:a,nickname:r?.nickname||"\uB098"}),{headers:e})}catch(n){return new Response(JSON.stringify({ok:!1,message:n.message}),{status:500,headers:e})}if(d.match(/^\/user\/\d+\/reviews$/)&&i.method==="GET")try{let n=parseInt(d.split("/")[2]),c=await t.DB.prepare("SELECT nickname FROM users WHERE id = ?").bind(n).first();if(!c)return new Response(JSON.stringify({ok:!1,message:"\uC720\uC800\uB97C \uCC3E\uC744 \uC218 \uC5C6\uC5B4\uC694"}),{status:404,headers:e});let r=(i.headers.get("Authorization")||"").replace("Bearer ","").trim()||h(i),a=-1;if(r){let p=await t.DB.prepare("SELECT user_id FROM sessions WHERE id = ? AND expires_at > datetime('now')").bind(r).first();p&&(a=p.user_id)}let{results:l}=await t.DB.prepare(`
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
      `).bind(n,a,n).all();return new Response(JSON.stringify({ok:!0,reviews:l,nickname:c.nickname||"\uC720\uC800"}),{headers:e})}catch(n){return new Response(JSON.stringify({ok:!1,message:n.message}),{status:500,headers:e})}if(d==="/life-works"&&i.method==="POST")try{let c=(i.headers.get("Authorization")||"").replace("Bearer ","").trim()||h(i);if(!c)return new Response(JSON.stringify({ok:!1,message:"\uB85C\uADF8\uC778 \uD544\uC694"}),{status:401,headers:e});let s=await t.DB.prepare("SELECT user_id FROM sessions WHERE id = ? AND expires_at > datetime('now')").bind(c).first();if(!s)return new Response(JSON.stringify({ok:!1,message:"\uC138\uC158 \uB9CC\uB8CC"}),{status:401,headers:e});let{tmdb_id:r,title_ko:a,poster_path:l,media_type:p}=await i.json();return r?await t.DB.prepare("SELECT id FROM life_works WHERE user_id = ? AND tmdb_id = ?").bind(s.user_id,parseInt(r)).first()?(await t.DB.prepare("DELETE FROM life_works WHERE user_id = ? AND tmdb_id = ?").bind(s.user_id,parseInt(r)).run(),new Response(JSON.stringify({ok:!0,saved:!1}),{headers:e})):(await t.DB.prepare("INSERT INTO life_works (user_id, tmdb_id, title_ko, poster_path, media_type) VALUES (?, ?, ?, ?, ?)").bind(s.user_id,parseInt(r),a||"",l||"",p||"tv").run(),g.waitUntil(H(s.user_id,2,"life_work",t)),new Response(JSON.stringify({ok:!0,saved:!0}),{headers:e})):new Response(JSON.stringify({ok:!1,message:"tmdb_id \uD544\uC694"}),{status:400,headers:e})}catch(n){return new Response(JSON.stringify({ok:!1,message:n.message}),{status:500,headers:e})}if(d.match(/^\/life-works\/check\/\d+$/)&&i.method==="GET")try{let n=parseInt(d.split("/")[3]),s=(i.headers.get("Authorization")||"").replace("Bearer ","").trim()||h(i);if(!s)return new Response(JSON.stringify({ok:!0,saved:!1}),{headers:e});let r=await t.DB.prepare("SELECT user_id FROM sessions WHERE id = ? AND expires_at > datetime('now')").bind(s).first();if(!r)return new Response(JSON.stringify({ok:!0,saved:!1}),{headers:e});let a=await t.DB.prepare("SELECT id FROM life_works WHERE user_id = ? AND tmdb_id = ?").bind(r.user_id,n).first();return new Response(JSON.stringify({ok:!0,saved:!!a}),{headers:e})}catch{return new Response(JSON.stringify({ok:!0,saved:!1}),{headers:e})}if(d==="/pick-lists"&&i.method==="GET")try{let c=(i.headers.get("Authorization")||"").replace("Bearer ","").trim()||h(i);if(!c)return new Response(JSON.stringify({ok:!1,message:"\uB85C\uADF8\uC778 \uD544\uC694"}),{status:401,headers:e});let s=await t.DB.prepare("SELECT user_id FROM sessions WHERE id = ? AND expires_at > datetime('now')").bind(c).first();if(!s)return new Response(JSON.stringify({ok:!1,message:"\uC138\uC158 \uB9CC\uB8CC"}),{status:401,headers:e});let{results:r}=await t.DB.prepare("SELECT * FROM pick_lists WHERE user_id = ? ORDER BY created_at DESC").bind(s.user_id).all(),a=await Promise.all(r.map(async l=>{let{results:p}=await t.DB.prepare("SELECT * FROM pick_list_works WHERE pick_list_id = ? ORDER BY sort_order ASC, created_at DESC").bind(l.id).all();return{...l,works:p,work_count:p.length}}));return new Response(JSON.stringify({ok:!0,data:a}),{headers:e})}catch(n){return new Response(JSON.stringify({ok:!1,message:n.message}),{status:500,headers:e})}if(d==="/pick-lists"&&i.method==="POST")try{let c=(i.headers.get("Authorization")||"").replace("Bearer ","").trim()||h(i);if(!c)return new Response(JSON.stringify({ok:!1,message:"\uB85C\uADF8\uC778 \uD544\uC694"}),{status:401,headers:e});let s=await t.DB.prepare("SELECT user_id FROM sessions WHERE id = ? AND expires_at > datetime('now')").bind(c).first();if(!s)return new Response(JSON.stringify({ok:!1,message:"\uC138\uC158 \uB9CC\uB8CC"}),{status:401,headers:e});let{title:r,description:a,is_public:l}=await i.json();if(!r||!r.trim())return new Response(JSON.stringify({ok:!1,message:"\uCEEC\uB809\uC158 \uC81C\uBAA9\uC744 \uC785\uB825\uD574\uC8FC\uC138\uC694"}),{status:400,headers:e});let p=await t.DB.prepare("INSERT INTO pick_lists (user_id, title, description, is_public) VALUES (?, ?, ?, ?)").bind(s.user_id,r.trim().slice(0,50),(a||"").slice(0,200),l!==!1?1:0).run(),_=await t.DB.prepare("SELECT id FROM pick_lists WHERE user_id = ? ORDER BY id DESC LIMIT 1").bind(s.user_id).first();return g.waitUntil(H(s.user_id,2,"pick_list",t)),new Response(JSON.stringify({ok:!0,id:_?.id||null}),{headers:e})}catch(n){return new Response(JSON.stringify({ok:!1,message:n.message}),{status:500,headers:e})}if(d.match(/^\/pick-lists\/\d+$/)&&i.method==="DELETE")try{let n=parseInt(d.split("/")[2]),s=(i.headers.get("Authorization")||"").replace("Bearer ","").trim()||h(i);if(!s)return new Response(JSON.stringify({ok:!1,message:"\uB85C\uADF8\uC778 \uD544\uC694"}),{status:401,headers:e});let r=await t.DB.prepare("SELECT user_id FROM sessions WHERE id = ? AND expires_at > datetime('now')").bind(s).first();return r?await t.DB.prepare("SELECT id FROM pick_lists WHERE id = ? AND user_id = ?").bind(n,r.user_id).first()?(await t.DB.prepare("DELETE FROM pick_lists WHERE id = ?").bind(n).run(),new Response(JSON.stringify({ok:!0}),{headers:e})):new Response(JSON.stringify({ok:!1,message:"\uCEEC\uB809\uC158\uC744 \uCC3E\uC744 \uC218 \uC5C6\uC5B4\uC694"}),{status:404,headers:e}):new Response(JSON.stringify({ok:!1,message:"\uC138\uC158 \uB9CC\uB8CC"}),{status:401,headers:e})}catch(n){return new Response(JSON.stringify({ok:!1,message:n.message}),{status:500,headers:e})}if(d.match(/^\/pick-lists\/\d+\/works$/)&&i.method==="POST")try{let n=parseInt(d.split("/")[2]),s=(i.headers.get("Authorization")||"").replace("Bearer ","").trim()||h(i);if(!s)return new Response(JSON.stringify({ok:!1,message:"\uB85C\uADF8\uC778 \uD544\uC694"}),{status:401,headers:e});let r=await t.DB.prepare("SELECT user_id FROM sessions WHERE id = ? AND expires_at > datetime('now')").bind(s).first();if(!r)return new Response(JSON.stringify({ok:!1,message:"\uC138\uC158 \uB9CC\uB8CC"}),{status:401,headers:e});if(!await t.DB.prepare("SELECT id FROM pick_lists WHERE id = ? AND user_id = ?").bind(n,r.user_id).first())return new Response(JSON.stringify({ok:!1,message:"\uCEEC\uB809\uC158\uC744 \uCC3E\uC744 \uC218 \uC5C6\uC5B4\uC694"}),{status:404,headers:e});let{tmdb_id:l,title_ko:p,poster_path:_,media_type:f}=await i.json();return l?await t.DB.prepare("SELECT id FROM pick_list_works WHERE pick_list_id = ? AND tmdb_id = ?").bind(n,parseInt(l)).first()?(await t.DB.prepare("DELETE FROM pick_list_works WHERE pick_list_id = ? AND tmdb_id = ?").bind(n,parseInt(l)).run(),new Response(JSON.stringify({ok:!0,added:!1}),{headers:e})):(await t.DB.prepare("INSERT INTO pick_list_works (pick_list_id, tmdb_id, title_ko, poster_path, media_type) VALUES (?, ?, ?, ?, ?)").bind(n,parseInt(l),p||"",_||"",f||"tv").run(),new Response(JSON.stringify({ok:!0,added:!0}),{headers:e})):new Response(JSON.stringify({ok:!1,message:"tmdb_id \uD544\uC694"}),{status:400,headers:e})}catch(n){return new Response(JSON.stringify({ok:!1,message:n.message}),{status:500,headers:e})}if(d.match(/^\/pick-lists\/check\/\d+$/)&&i.method==="GET")try{let n=parseInt(d.split("/")[3]),s=(i.headers.get("Authorization")||"").replace("Bearer ","").trim()||h(i);if(!s)return new Response(JSON.stringify({ok:!0,lists:[]}),{headers:e});let r=await t.DB.prepare("SELECT user_id FROM sessions WHERE id = ? AND expires_at > datetime('now')").bind(s).first();if(!r)return new Response(JSON.stringify({ok:!0,lists:[]}),{headers:e});let{results:a}=await t.DB.prepare("SELECT * FROM pick_lists WHERE user_id = ? ORDER BY created_at DESC").bind(r.user_id).all(),l=await Promise.all(a.map(async p=>{let _=await t.DB.prepare("SELECT id FROM pick_list_works WHERE pick_list_id = ? AND tmdb_id = ?").bind(p.id,n).first(),{results:f}=await t.DB.prepare("SELECT COUNT(*) as cnt FROM pick_list_works WHERE pick_list_id = ?").bind(p.id).all();return{...p,has_work:!!_,work_count:f[0]?.cnt||0}}));return new Response(JSON.stringify({ok:!0,lists:l}),{headers:e})}catch{return new Response(JSON.stringify({ok:!0,lists:[]}),{headers:e})}if(d==="/reviews/recent"&&i.method==="GET")try{let n=new URL(i.url).searchParams,c=Math.min(parseInt(n.get("limit")||"5"),20),s=Math.max(1,parseInt(n.get("page")||"1")),r=(s-1)*c,l=(i.headers.get("Authorization")||"").replace("Bearer ","").trim()||h(i),p=-1;if(l){let m=await t.DB.prepare("SELECT user_id FROM sessions WHERE id = ? AND expires_at > datetime('now')").bind(l).first();m&&(p=m.user_id)}let f=(await t.DB.prepare("SELECT COUNT(*) AS total FROM reviews").first())?.total||0,{results:u}=await t.DB.prepare(`
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
      `).bind(p,c,r).all();return new Response(JSON.stringify({ok:!0,reviews:u||[],total:f,page:s,limit:c}),{headers:e})}catch(n){return new Response(JSON.stringify({ok:!1,message:n.message}),{status:500,headers:e})}if(d==="/grade-settings"&&i.method==="GET")try{let{results:n}=await t.DB.prepare("SELECT * FROM grade_settings ORDER BY sort_order ASC").all();return new Response(JSON.stringify({ok:!0,data:n}),{headers:e})}catch(n){return new Response(JSON.stringify({ok:!1,message:n.message}),{status:500,headers:e})}if(d==="/reviews/share"&&i.method==="POST")try{let c=(i.headers.get("Authorization")||"").replace("Bearer ","").trim()||h(i);if(!c)return new Response(JSON.stringify({ok:!1,message:"\uB85C\uADF8\uC778 \uD544\uC694"}),{status:401,headers:e});let s=await t.DB.prepare("SELECT user_id FROM sessions WHERE id = ? AND expires_at > datetime('now')").bind(c).first();if(!s)return new Response(JSON.stringify({ok:!1,message:"\uC138\uC158 \uB9CC\uB8CC"}),{status:401,headers:e});let r=new Date(Date.now()+540*60*1e3).toISOString().slice(0,10);return await t.DB.prepare(`SELECT id FROM user_point_logs
         WHERE user_id = ? AND reason = 'share'
         AND DATE(created_at) = ?
         LIMIT 1`).bind(s.user_id,r).first()?new Response(JSON.stringify({ok:!0,already:!0,message:"\uC624\uB298\uC740 \uC774\uBBF8 \uACF5\uC720 \uC624\uB728\uB97C \uBC1B\uC558\uC5B4\uC694"}),{headers:e}):(await H(s.user_id,10,"share",t),new Response(JSON.stringify({ok:!0,already:!1,points:10}),{headers:e}))}catch(n){return new Response(JSON.stringify({ok:!1,message:n.message}),{status:500,headers:e})}if(d==="/admin/reviews"&&i.method==="GET"){if(i.headers.get("Authorization")!==`Bearer ${t.ADMIN_SECRET}`)return new Response(JSON.stringify({ok:!1,message:"Unauthorized"}),{status:401,headers:e});try{let n=new URL(i.url),c=(n.searchParams.get("q")||"").trim(),s=Math.max(1,parseInt(n.searchParams.get("page")||"1")),r=Math.min(parseInt(n.searchParams.get("limit")||"20"),50),a=(s-1)*r,l=c?"WHERE u.nickname LIKE ? OR w.title_ko LIKE ?":"",p=c?[`%${c}%`,`%${c}%`]:[],[_,f]=await t.DB.batch([t.DB.prepare(`
          SELECT r.id, r.tmdb_id, r.score, r.text, r.emotions, r.likes, r.created_at,
                 u.nickname, w.title_ko, w.poster_path
          FROM reviews r
          JOIN users u ON r.user_id = u.id
          LEFT JOIN works w ON r.tmdb_id = w.tmdb_id
          ${l}
          ORDER BY r.created_at DESC
          LIMIT ? OFFSET ?
        `).bind(...p,r,a),t.DB.prepare(`
          SELECT COUNT(*) as cnt
          FROM reviews r
          JOIN users u ON r.user_id = u.id
          LEFT JOIN works w ON r.tmdb_id = w.tmdb_id
          ${l}
        `).bind(...p)]),u=_.results||[],m=f.results?.[0]?.cnt||0;return new Response(JSON.stringify({ok:!0,data:u,total:m,page:s,limit:r}),{headers:e})}catch(n){return new Response(JSON.stringify({ok:!1,message:n.message}),{status:500,headers:e})}}let o=d.match(/^\/admin\/reviews\/(\d+)$/);if(i.method==="DELETE"&&o){if(i.headers.get("Authorization")!==`Bearer ${t.ADMIN_SECRET}`)return new Response(JSON.stringify({ok:!1,message:"Unauthorized"}),{status:401,headers:e});try{let n=o[1],c=await t.DB.prepare("SELECT id, user_id FROM reviews WHERE id = ?").bind(n).first();return c?(await t.DB.prepare("DELETE FROM reviews WHERE id = ?").bind(n).run(),c.user_id&&g.waitUntil(F(c.user_id,t)),new Response(JSON.stringify({ok:!0}),{headers:e})):new Response(JSON.stringify({ok:!1,message:"\uCC3E\uC744 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4"}),{status:404,headers:e})}catch(n){return new Response(JSON.stringify({ok:!1,message:n.message}),{status:500,headers:e})}}return null}async function st(d,i,t,g,e,o){if(d==="/posts"&&i.method==="GET")try{let n=e.searchParams.get("board")||"free",c=parseInt(e.searchParams.get("page")||"1"),s=20,r=(c-1)*s,{results:a}=await t.DB.prepare(`
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
      `).bind(n,s,r).all(),l=await t.DB.prepare("SELECT COUNT(*) as cnt FROM posts WHERE board_type = ? AND is_hidden = 0").bind(n).first();return new Response(JSON.stringify({ok:!0,data:a,total:l?.cnt||0,page:c,limit:s}),{headers:o})}catch(n){return new Response(JSON.stringify({ok:!1,message:n.message}),{status:500,headers:o})}if(d.match(/^\/posts\/\d+$/)&&i.method==="GET")try{let n=parseInt(d.split("/")[2]);await t.DB.prepare("UPDATE posts SET view_count = view_count + 1 WHERE id = ?").bind(n).run();let c=await t.DB.prepare(`
        SELECT p.*, u.nickname, u.grade,
          gs.emoji_url as grade_emoji_url, gs.grade_name
        FROM posts p
        JOIN users u ON p.user_id = u.id
        LEFT JOIN grade_settings gs ON gs.grade_key = u.grade
        WHERE p.id = ? AND p.is_hidden = 0
      `).bind(n).first();return c?new Response(JSON.stringify({ok:!0,data:c}),{headers:o}):new Response(JSON.stringify({ok:!1,message:"Not found"}),{status:404,headers:o})}catch(n){return new Response(JSON.stringify({ok:!1,message:n.message}),{status:500,headers:o})}if(d==="/posts"&&i.method==="POST")try{let c=(i.headers.get("Authorization")||"").replace("Bearer ","").trim()||h(i);if(!c)return new Response(JSON.stringify({ok:!1,message:"\uB85C\uADF8\uC778 \uD544\uC694"}),{status:401,headers:o});let s=await t.DB.prepare("SELECT user_id FROM sessions WHERE id = ? AND expires_at > datetime('now')").bind(c).first();if(!s)return new Response(JSON.stringify({ok:!1,message:"\uC138\uC158 \uB9CC\uB8CC"}),{status:401,headers:o});let r=await i.json(),{board_type:a,title:l,content:p}=r;if(!["recommend","free","community"].includes(a))return new Response(JSON.stringify({ok:!1,message:"\uC62C\uBC14\uB978 \uAC8C\uC2DC\uD310\uC744 \uC120\uD0DD\uD574\uC8FC\uC138\uC694"}),{status:400,headers:o});if(!l||l.trim().length<2)return new Response(JSON.stringify({ok:!1,message:"\uC81C\uBAA9\uC740 2\uC790 \uC774\uC0C1 \uC785\uB825\uD574\uC8FC\uC138\uC694"}),{status:400,headers:o});if(l.trim().length>100)return new Response(JSON.stringify({ok:!1,message:"\uC81C\uBAA9\uC740 100\uC790 \uC774\uB0B4\uB85C \uC785\uB825\uD574\uC8FC\uC138\uC694"}),{status:400,headers:o});if(!p||p.trim().length<5)return new Response(JSON.stringify({ok:!1,message:"\uB0B4\uC6A9\uC740 5\uC790 \uC774\uC0C1 \uC785\uB825\uD574\uC8FC\uC138\uC694"}),{status:400,headers:o});let _=await t.DB.prepare("INSERT INTO posts (board_type, user_id, title, content) VALUES (?, ?, ?, ?)").bind(a,s.user_id,l.trim(),p.trim()).run();return g.waitUntil(F(s.user_id,t)),new Response(JSON.stringify({ok:!0,id:_.meta?.last_row_id}),{headers:o})}catch(n){return new Response(JSON.stringify({ok:!1,message:n.message}),{status:500,headers:o})}if(d.match(/^\/posts\/\d+$/)&&i.method==="PATCH")try{let n=parseInt(d.split("/")[2]),s=(i.headers.get("Authorization")||"").replace("Bearer ","").trim()||h(i);if(!s)return new Response(JSON.stringify({ok:!1,message:"\uB85C\uADF8\uC778 \uD544\uC694"}),{status:401,headers:o});let r=await t.DB.prepare("SELECT user_id FROM sessions WHERE id = ? AND expires_at > datetime('now')").bind(s).first();if(!r)return new Response(JSON.stringify({ok:!1,message:"\uC138\uC158 \uB9CC\uB8CC"}),{status:401,headers:o});let a=await t.DB.prepare("SELECT user_id FROM posts WHERE id = ?").bind(n).first();if(!a)return new Response(JSON.stringify({ok:!1,message:"\uAC8C\uC2DC\uAE00 \uC5C6\uC74C"}),{status:404,headers:o});if(a.user_id!==r.user_id)return new Response(JSON.stringify({ok:!1,message:"\uAD8C\uD55C \uC5C6\uC74C"}),{status:403,headers:o});let l=await i.json(),{title:p,content:_}=l;return await t.DB.prepare("UPDATE posts SET title = ?, content = ?, updated_at = datetime('now') WHERE id = ?").bind(p.trim(),_.trim(),n).run(),new Response(JSON.stringify({ok:!0}),{headers:o})}catch(n){return new Response(JSON.stringify({ok:!1,message:n.message}),{status:500,headers:o})}if(d.match(/^\/posts\/\d+$/)&&i.method==="DELETE")try{let n=parseInt(d.split("/")[2]),s=(i.headers.get("Authorization")||"").replace("Bearer ","").trim()||h(i);if(!s)return new Response(JSON.stringify({ok:!1,message:"\uB85C\uADF8\uC778 \uD544\uC694"}),{status:401,headers:o});let r=await t.DB.prepare("SELECT user_id FROM sessions WHERE id = ? AND expires_at > datetime('now')").bind(s).first();if(!r)return new Response(JSON.stringify({ok:!1,message:"\uC138\uC158 \uB9CC\uB8CC"}),{status:401,headers:o});let a=await t.DB.prepare("SELECT user_id FROM posts WHERE id = ?").bind(n).first();return a?a.user_id!==r.user_id?new Response(JSON.stringify({ok:!1,message:"\uAD8C\uD55C \uC5C6\uC74C"}),{status:403,headers:o}):(await t.DB.prepare("DELETE FROM posts WHERE id = ?").bind(n).run(),g.waitUntil(F(r.user_id,t)),new Response(JSON.stringify({ok:!0}),{headers:o})):new Response(JSON.stringify({ok:!1,message:"\uAC8C\uC2DC\uAE00 \uC5C6\uC74C"}),{status:404,headers:o})}catch(n){return new Response(JSON.stringify({ok:!1,message:n.message}),{status:500,headers:o})}if(d.match(/^\/posts\/\d+\/like$/)&&i.method==="POST")try{let n=parseInt(d.split("/")[2]),c=await t.DB.prepare("SELECT user_id FROM posts WHERE id = ?").bind(n).first();return await t.DB.prepare("UPDATE posts SET like_count = like_count + 1 WHERE id = ?").bind(n).run(),c?.user_id&&(await t.DB.prepare("UPDATE users SET total_likes_received = total_likes_received + 1 WHERE id = ?").bind(c.user_id).run(),g.waitUntil(F(c.user_id,t))),new Response(JSON.stringify({ok:!0}),{headers:o})}catch(n){return new Response(JSON.stringify({ok:!1,message:n.message}),{status:500,headers:o})}return null}async function Y(d,i,t,g,e){let o=d.match(/^\/work-ott\/(\d+)$/);if(o&&i.method==="GET"){let s=parseInt(o[1]);try{let{results:r}=await t.DB.prepare(`SELECT id, tmdb_id, ott_key, action, created_at
         FROM work_ott_overrides
         WHERE tmdb_id = ?
         ORDER BY created_at DESC`).bind(s).all();return new Response(JSON.stringify({ok:!0,data:r||[]}),{headers:e})}catch(r){return new Response(JSON.stringify({ok:!1,error:r.message}),{status:500,headers:e})}}if(d==="/work-ott"&&i.method==="POST"){if(!b(i,t))return new Response(JSON.stringify({ok:!1,error:"Unauthorized"}),{status:401,headers:e});try{let s=await i.json(),{tmdb_id:r,ott_key:a,action:l}=s;return!r||!a||!l?new Response(JSON.stringify({ok:!1,error:"tmdb_id, ott_key, action \uD544\uC218"}),{status:400,headers:e}):["add","remove"].includes(l)?(await t.DB.prepare(`INSERT INTO work_ott_overrides (tmdb_id, ott_key, action)
         VALUES (?, ?, ?)
         ON CONFLICT(tmdb_id, ott_key)
         DO UPDATE SET action = excluded.action,
                       created_at = datetime('now')`).bind(r,a,l).run(),new Response(JSON.stringify({ok:!0}),{headers:e})):new Response(JSON.stringify({ok:!1,error:"action\uC740 'add' \uB610\uB294 'remove'\uB9CC \uD5C8\uC6A9"}),{status:400,headers:e})}catch(s){return new Response(JSON.stringify({ok:!1,error:s.message}),{status:500,headers:e})}}let n=d.match(/^\/work-ott\/(\d+)$/);if(n&&i.method==="DELETE"){if(!b(i,t))return new Response(JSON.stringify({ok:!1,error:"Unauthorized"}),{status:401,headers:e});let s=parseInt(n[1]);try{return await t.DB.prepare("DELETE FROM work_ott_overrides WHERE id = ?").bind(s).run(),new Response(JSON.stringify({ok:!0}),{headers:e})}catch(r){return new Response(JSON.stringify({ok:!1,error:r.message}),{status:500,headers:e})}}if(d==="/admin/title-map"&&i.method==="GET"){if(!b(i,t))return new Response(JSON.stringify({ok:!1,message:"Unauthorized"}),{status:401,headers:e});try{let s=parseInt(g.searchParams.get("page")||"1"),r=50,a=(s-1)*r,{results:l}=await t.DB.prepare("SELECT * FROM title_map ORDER BY created_at DESC LIMIT ? OFFSET ?").bind(r,a).all();return new Response(JSON.stringify({ok:!0,data:l}),{headers:e})}catch(s){return new Response(JSON.stringify({ok:!1,message:s.message}),{status:500,headers:e})}}if(d==="/admin/rankings"&&i.method==="POST"){if(!b(i,t))return new Response(JSON.stringify({ok:!1,message:"Unauthorized"}),{status:401,headers:e});try{let s=await i.json(),{platform:r,category_slot:a,date:l,tmdb_id:p,rank:_,title_ko:f,title_en:u,media_type:m,is_manual:k}=s;if(!r||!a||!l||!p||!f)return new Response(JSON.stringify({ok:!1,message:"platform, category_slot, date, tmdb_id, title_ko \uD544\uC218"}),{status:400,headers:e});let E=null,w=f||null,y=u||null,O=null,N=null,R=null,D=m==="tv"||m==="movie"?m:null;try{let T=D?[D]:["tv","movie"];for(let L of T){let C=await fetch(`https://api.themoviedb.org/3/${L}/${p}?language=ko-KR&api_key=${t.TMDB_API_KEY}`);if(!C.ok)continue;let I=await C.json();if(!(!I.poster_path&&!I.name&&!I.title)){if(E=I.poster_path||null,O=parseInt((I.first_air_date||I.release_date||"").slice(0,4))||null,R=I.vote_average?parseFloat(I.vote_average.toFixed(1)):null,N=(I.genres||[]).map(B=>B.name).join(", ")||null,D||(D=L),w||(w=I.name||I.title||null),!y){let B=await fetch(`https://api.themoviedb.org/3/${L}/${p}?language=en-US&api_key=${t.TMDB_API_KEY}`);if(B.ok){let J=await B.json(),M=J.original_title||J.original_name||"",W=J.title||J.name||"";y=/[\uAC00-\uD7A3]/.test(M)?W:M||W}}break}}}catch{}await t.DB.prepare(`
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
      `).bind(parseInt(p),w||"",y||"",E,D,w||null,y||null,E,D).run();let S=parseInt(_)||null;return S||(S=((await t.DB.prepare("SELECT MAX(rank) as max_rank FROM rankings WHERE platform = ? AND category_slot = ? AND date = ?").bind(r,a,l).first())?.max_rank||0)+1),await t.DB.prepare(`
        INSERT INTO rankings
          (platform, category_slot, category, date, rank, tmdb_id,
           title_ko, title_en, poster_path, release_year, genre, tmdb_rating,
           is_manual, source_name)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).bind(r,a,a,l,-S,parseInt(p),w||"",y||"",E,O,N,R,k?1:0,a).run(),await t.DB.prepare("UPDATE rankings SET rank = ? WHERE platform = ? AND category_slot = ? AND date = ? AND rank = ?").bind(S,r,a,l,-S).run(),y&&w&&await t.DB.prepare(`
          INSERT INTO title_map (title_en, title_ko, tmdb_id)
          VALUES (?, ?, ?)
          ON CONFLICT(title_en) DO UPDATE SET
            title_ko = excluded.title_ko,
            tmdb_id  = COALESCE(excluded.tmdb_id, tmdb_id)
        `).bind(y.trim(),w.trim(),parseInt(p)).run(),await t.DB.prepare("INSERT INTO admin_logs (action, platform, category_slot, target_id, after_value) VALUES ('ranking_add', ?, ?, ?, ?)").bind(r,a,String(p),JSON.stringify({rank:S,title_ko:w,date:l})).run(),new Response(JSON.stringify({ok:!0,rank:S,poster_path:E,title_ko:w,title_en:y}),{headers:e})}catch(s){return new Response(JSON.stringify({ok:!1,message:s.message}),{status:500,headers:e})}}if(d==="/admin/rankings"&&i.method==="GET"){if(!b(i,t))return new Response(JSON.stringify({ok:!1,message:"Unauthorized"}),{status:401,headers:e});let s=g.searchParams.get("date"),r=g.searchParams.get("manual"),a,l;r==="true"?(a="SELECT * FROM rankings WHERE date = 'manual' ORDER BY platform, category_slot, rank",l=null):s?(a="SELECT * FROM rankings WHERE date = ? ORDER BY platform, category_slot, rank",l=s):(a="SELECT * FROM rankings WHERE date = (SELECT MAX(date) FROM rankings WHERE date != 'manual') ORDER BY platform, category_slot, rank",l=null);let{results:p}=l?await t.DB.prepare(a).bind(l).all():await t.DB.prepare(a).all();return new Response(JSON.stringify({ok:!0,data:p}),{headers:e})}if(d==="/admin/fix"&&i.method==="POST"){if(!b(i,t))return new Response(JSON.stringify({ok:!1,message:"Unauthorized"}),{status:401,headers:e});try{let s=await i.json(),{id:r,tmdb_id:a,title_ko:l,title_en:p,delete_duplicates:_,media_type:f}=s,u=s.season!==void 0?s.season:void 0,m=s.poster_path||null;if(!r)return new Response(JSON.stringify({ok:!1,message:"id required"}),{status:400,headers:e});let k=null,E=l||null,w=p||null,y=await t.DB.prepare("SELECT title_ko, title_en, poster_path FROM rankings WHERE id = ?").bind(parseInt(r)).first();if(a)try{let D=f==="movie"?["movie"]:f==="tv"?["tv"]:["tv","movie"];for(let S of D){let T=await fetch(`https://api.themoviedb.org/3/${S}/${a}?language=ko-KR&api_key=${t.TMDB_API_KEY}`);if(!T.ok)continue;let L=await T.json();if(!(!L.poster_path&&!L.name&&!L.title)){if(k=L.poster_path||null,E||(E=L.name||L.title||null),!w){let C=await fetch(`https://api.themoviedb.org/3/${S}/${a}?language=en-US&api_key=${t.TMDB_API_KEY}`);if(C.ok){let I=await C.json(),B=I.original_title||I.original_name||"",J=I.title||I.name||"";w=/[\uAC00-\uD7A3]/.test(B)?J:B||J}}break}}}catch{}m&&(k=m);let O=u!==void 0?u!==null?parseInt(u):null:void 0;if(await t.DB.prepare(`
        UPDATE rankings
        SET tmdb_id     = COALESCE(?, tmdb_id),
            title_ko    = COALESCE(?, title_ko),
            title_en    = COALESCE(?, title_en),
            poster_path = COALESCE(?, poster_path),
            season      = ${O!==void 0?"?":"season"},
            is_manual   = 1
        WHERE id = ?
      `).bind(a?parseInt(a):null,E,w,k,...O!==void 0?[O]:[],parseInt(r)).run(),a){_&&(w&&await t.DB.prepare("DELETE FROM works WHERE title_en = ? AND tmdb_id != ?").bind(w,parseInt(a)).run(),E&&/[\uAC00-\uD7A3]/.test(E)&&await t.DB.prepare("DELETE FROM works WHERE title_ko = ? AND tmdb_id != ?").bind(E,parseInt(a)).run(),await t.DB.prepare("INSERT INTO admin_logs (action, target_id, memo) VALUES ('works_delete', ?, ?)").bind(String(a),`\uC911\uBCF5 \uC0AD\uC81C: title_en="${w}" title_ko="${E}"`).run());let D=f==="tv"||f==="movie"?f:null,S=m?null:k;await t.DB.prepare(`
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
        `).bind(N.trim(),R.trim(),parseInt(a)).run(),new Response(JSON.stringify({ok:!0,poster_path:k,title_ko:E,title_en:w}),{headers:e})}catch(s){return new Response(JSON.stringify({ok:!1,message:s.message}),{status:500,headers:e})}}if(d==="/admin/unfix"&&i.method==="POST"){if(!b(i,t))return new Response(JSON.stringify({ok:!1,message:"Unauthorized"}),{status:401,headers:e});let s=await i.json(),{id:r}=s;return await t.DB.prepare("UPDATE rankings SET is_manual = 0 WHERE id = ?").bind(r).run(),new Response(JSON.stringify({ok:!0}),{headers:e})}let c=d.match(/^\/admin\/rankings\/(\d+)$/);if(c&&i.method==="PATCH"){if(!b(i,t))return new Response(JSON.stringify({ok:!1,message:"Unauthorized"}),{status:401,headers:e});try{let s=parseInt(c[1]),{is_manual:r}=await i.json();if(r!==0&&r!==2)return new Response(JSON.stringify({ok:!1,message:"is_manual \uAC12\uC740 0(\uD574\uC81C) \uB610\uB294 2(\uD06C\uB864\uB9C1\uACE0\uC815)\uB9CC \uD5C8\uC6A9\uB429\uB2C8\uB2E4."}),{status:400,headers:e});let a=await t.DB.prepare("SELECT id, platform, category_slot, title_ko FROM rankings WHERE id = ?").bind(s).first();return a?(await t.DB.prepare("UPDATE rankings SET is_manual = ? WHERE id = ?").bind(r,s).run(),await t.DB.prepare("INSERT INTO admin_logs (action, platform, category_slot, target_id, after_value) VALUES ('crawl_lock', ?, ?, ?, ?)").bind(a.platform,a.category_slot,String(s),JSON.stringify({is_manual:r,title_ko:a.title_ko})).run(),new Response(JSON.stringify({ok:!0,is_manual:r}),{headers:e})):new Response(JSON.stringify({ok:!1,message:"\uD574\uB2F9 \uB7AD\uD0B9\uC744 \uCC3E\uC744 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4."}),{status:404,headers:e})}catch(s){return new Response(JSON.stringify({ok:!1,message:s.message}),{status:500,headers:e})}}if(d==="/admin/categories"&&i.method==="GET"){if(!b(i,t))return new Response(JSON.stringify({ok:!1,message:"Unauthorized"}),{status:401,headers:e});try{let s=g.searchParams.get("platform"),r="SELECT * FROM ott_categories",a=[];s&&(r+=" WHERE platform = ?",a.push(s)),r+=" ORDER BY platform, category_slot";let{results:l}=a.length?await t.DB.prepare(r).bind(...a).all():await t.DB.prepare(r).all();return new Response(JSON.stringify({ok:!0,data:l}),{headers:e})}catch(s){return new Response(JSON.stringify({ok:!1,message:s.message}),{status:500,headers:e})}}if(d.match(/^\/admin\/categories\/\d+$/)&&i.method==="PATCH"){if(!b(i,t))return new Response(JSON.stringify({ok:!1,message:"Unauthorized"}),{status:401,headers:e});try{let s=parseInt(d.split("/")[3]),r=await i.json(),{display_name:a,crawl_limit:l,main_limit:p,platform_limit:_,is_active:f,main_section:u,main_order:m,platform_section:k,platform_order:E,memo_label:w,hot100_eligible:y,hot100_weight:O,person_section:N,person_order:R,person_limit:D}=r;return await t.DB.prepare(`
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
      `).bind(a??null,l??null,p??null,_??null,f??null,u===void 0?"__SKIP__":"__SET__",u===void 0?null:u||null,m===void 0?"__SKIP__":"__SET__",m===void 0?null:m??0,k===void 0?"__SKIP__":"__SET__",k===void 0?null:k||null,E===void 0?"__SKIP__":"__SET__",E===void 0?null:E??0,w===void 0?"__SKIP__":"__SET__",w===void 0?null:w||null,y===void 0?"__SKIP__":"__SET__",y===void 0?null:y??0,O??null,N===void 0?"__SKIP__":"__SET__",N===void 0?null:N||null,R===void 0?"__SKIP__":"__SET__",R===void 0?null:R??0,D??null,s).run(),await t.DB.prepare("INSERT INTO admin_logs (action, target_id, after_value) VALUES ('category_setting', ?, ?)").bind(String(s),JSON.stringify(r)).run(),new Response(JSON.stringify({ok:!0}),{headers:e})}catch(s){return new Response(JSON.stringify({ok:!1,message:s.message}),{status:500,headers:e})}}if(d==="/admin/categories"&&i.method==="POST"){if(!b(i,t))return new Response(JSON.stringify({ok:!1,message:"Unauthorized"}),{status:401,headers:e});try{let s=await i.json(),{platform:r,category_slot:a,source_name:l,display_name:p,crawl_limit:_,main_limit:f,platform_limit:u,is_active:m}=s;if(!r||!a||!l)return new Response(JSON.stringify({ok:!1,message:"platform, category_slot, source_name required"}),{status:400,headers:e});let E=((await t.DB.prepare("SELECT MAX(table_index) as max_idx FROM ott_categories WHERE platform = ?").bind(r).first())?.max_idx??-1)+1;await t.DB.prepare(`
        INSERT INTO ott_categories
          (platform, category_slot, table_index, source_name, display_name,
           crawl_limit, main_limit, platform_limit, is_active)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(platform, category_slot) DO NOTHING
      `).bind(r,a,E,l,p||l,_||20,f||10,u||20,m??1).run();let w=await t.DB.prepare("SELECT * FROM ott_categories WHERE platform = ? AND category_slot = ?").bind(r,a).first();return await t.DB.prepare("INSERT INTO admin_logs (action, platform, category_slot, after_value) VALUES ('category_create', ?, ?, ?)").bind(r,a,JSON.stringify(s)).run(),new Response(JSON.stringify({ok:!0,data:w}),{headers:e})}catch(s){return new Response(JSON.stringify({ok:!1,message:s.message}),{status:500,headers:e})}}if(d==="/admin/review-queue/count"&&i.method==="GET"){if(!b(i,t))return new Response(JSON.stringify({ok:!1,message:"Unauthorized"}),{status:401,headers:e});try{let s=await t.DB.prepare("SELECT COUNT(*) as count FROM review_queue WHERE status = 'pending'").first();return new Response(JSON.stringify({ok:!0,count:s?.count||0}),{headers:e})}catch(s){return new Response(JSON.stringify({ok:!1,message:s.message}),{status:500,headers:e})}}if(d==="/admin/review-queue"&&i.method==="GET"){if(!b(i,t))return new Response(JSON.stringify({ok:!1,message:"Unauthorized"}),{status:401,headers:e});try{let s=g.searchParams.get("status")||"pending",r=g.searchParams.get("platform"),a="SELECT * FROM review_queue WHERE status = ?",l=[s];r&&(a+=" AND platform = ?",l.push(r)),a+=" ORDER BY crawled_date DESC, platform, category_slot, rank";let{results:p}=await t.DB.prepare(a).bind(...l).all();return new Response(JSON.stringify({ok:!0,data:p}),{headers:e})}catch(s){return new Response(JSON.stringify({ok:!1,message:s.message}),{status:500,headers:e})}}if(d.match(/^\/admin\/review-queue\/\d+\/resolve$/)&&i.method==="POST"){if(!b(i,t))return new Response(JSON.stringify({ok:!1,message:"Unauthorized"}),{status:401,headers:e});try{let s=parseInt(d.split("/")[3]),r=await i.json(),{tmdb_id:a,title_ko:l,title_en:p}=r;if(!a)return new Response(JSON.stringify({ok:!1,message:"tmdb_id required"}),{status:400,headers:e});let _=await t.DB.prepare("SELECT * FROM review_queue WHERE id = ?").bind(s).first();if(!_)return new Response(JSON.stringify({ok:!1,message:"Queue item not found"}),{status:404,headers:e});let f=null,u=l,m=p;try{for(let E of["tv","movie"]){let w=await fetch(`https://api.themoviedb.org/3/${E}/${a}?language=ko-KR&api_key=${t.TMDB_API_KEY}`);if(w.ok){let y=await w.json();if(y.name||y.title){f=y.poster_path||null,u||(u=y.name||y.title);break}}}if(!m)for(let E of["tv","movie"]){let w=await fetch(`https://api.themoviedb.org/3/${E}/${a}?language=en-US&api_key=${t.TMDB_API_KEY}`);if(w.ok){let y=await w.json();if(y.name||y.title){m=y.title||y.name;break}}}}catch{}if(r.delete_duplicates===!0&&(m||_.title_en)){let E=m||_.title_en;await t.DB.prepare("DELETE FROM works WHERE title_en = ? AND tmdb_id != ?").bind(E,parseInt(a)).run(),await t.DB.prepare("INSERT INTO admin_logs (action, target_id, before_value, memo) VALUES ('works_delete', ?, ?, ?)").bind(String(a),JSON.stringify({title_en:E}),`\uC911\uBCF5 \uC0AD\uC81C: title_en="${E}" tmdb_id!=${a}`).run()}return await t.DB.prepare(`
        INSERT INTO works (tmdb_id, title_ko, title_en, poster_path, match_source, confidence_score)
        VALUES (?, ?, ?, ?, 'admin', 100)
        ON CONFLICT(tmdb_id) DO UPDATE SET
          title_ko         = COALESCE(?, title_ko),
          title_en         = COALESCE(NULLIF(?, ''), title_en),
          poster_path      = COALESCE(?, poster_path),
          match_source     = 'admin',
          confidence_score = 100,
          updated_at       = datetime('now')
      `).bind(parseInt(a),u||"",m||"",f,u||null,m||null,f).run(),await t.DB.prepare(`
        UPDATE rankings SET
          tmdb_id     = ?,
          title_ko    = COALESCE(?, title_ko),
          title_en    = COALESCE(?, title_en),
          poster_path = COALESCE(?, poster_path),
          is_manual   = 1
        WHERE platform = ? AND category_slot = ? AND rank = ? AND date = ?
      `).bind(parseInt(a),u||null,m||null,f,_.platform,_.category_slot,_.rank,_.crawled_date).run(),await t.DB.prepare(`
        UPDATE review_queue SET
          status           = 'resolved',
          resolved_tmdb_id = ?,
          resolved_at      = datetime('now')
        WHERE id = ?
      `).bind(parseInt(a),s).run(),await t.DB.prepare("INSERT INTO admin_logs (action, platform, category_slot, target_id, after_value) VALUES ('queue_resolve', ?, ?, ?, ?)").bind(_.platform,_.category_slot,String(a),JSON.stringify({tmdb_id:a,title_ko:u,title_en:m})).run(),new Response(JSON.stringify({ok:!0,poster_path:f,title_ko:u,title_en:m}),{headers:e})}catch(s){return new Response(JSON.stringify({ok:!1,message:s.message}),{status:500,headers:e})}}if(d==="/admin/rank-override"&&i.method==="POST"){if(!b(i,t))return new Response(JSON.stringify({ok:!1,message:"Unauthorized"}),{status:401,headers:e});try{let s=await i.json(),{platform:r,category_slot:a,date:l,tmdb_id:p,original_rank:_,override_rank:f,reason:u}=s;return!r||!a||!l||!p||!f?new Response(JSON.stringify({ok:!1,message:"\uD544\uC218 \uD30C\uB77C\uBBF8\uD130 \uB204\uB77D"}),{status:400,headers:e}):(await t.DB.prepare(`
        INSERT INTO rank_overrides
          (platform, category_slot, date, tmdb_id, original_rank, override_rank, reason)
        VALUES (?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(platform, category_slot, date, tmdb_id) DO UPDATE SET
          override_rank = excluded.override_rank,
          reason        = excluded.reason,
          updated_at    = datetime('now')
      `).bind(r,a,l,parseInt(p),_||0,parseInt(f),u||null).run(),await t.DB.prepare("INSERT INTO admin_logs (action, platform, category_slot, target_id, before_value, after_value) VALUES ('rank_override', ?, ?, ?, ?, ?)").bind(r,a,String(p),JSON.stringify({rank:_}),JSON.stringify({rank:f,reason:u})).run(),new Response(JSON.stringify({ok:!0}),{headers:e}))}catch(s){return new Response(JSON.stringify({ok:!1,message:s.message}),{status:500,headers:e})}}if(d==="/admin/rank-override"&&i.method==="DELETE"){if(!b(i,t))return new Response(JSON.stringify({ok:!1,message:"Unauthorized"}),{status:401,headers:e});try{let s=await i.json(),{platform:r,category_slot:a,date:l,tmdb_id:p}=s;return await t.DB.prepare("DELETE FROM rank_overrides WHERE platform = ? AND category_slot = ? AND date = ? AND tmdb_id = ?").bind(r,a,l,parseInt(p)).run(),new Response(JSON.stringify({ok:!0}),{headers:e})}catch(s){return new Response(JSON.stringify({ok:!1,message:s.message}),{status:500,headers:e})}}if(d.match(/^\/admin\/works\/\d+$/)&&i.method==="GET"){if(!b(i,t))return new Response(JSON.stringify({ok:!1,message:"Unauthorized"}),{status:401,headers:e});try{let s=parseInt(d.split("/")[3]),r=await t.DB.prepare("SELECT * FROM works WHERE tmdb_id = ?").bind(s).first();return r?new Response(JSON.stringify({ok:!0,data:r}),{headers:e}):new Response(JSON.stringify({ok:!1,message:"Not found"}),{status:404,headers:e})}catch(s){return new Response(JSON.stringify({ok:!1,message:s.message}),{status:500,headers:e})}}if(d==="/admin/works"&&i.method==="GET"){if(!b(i,t))return new Response(JSON.stringify({ok:!1,message:"Unauthorized"}),{status:401,headers:e});try{let s=g.searchParams.get("q")||"",r=g.searchParams.get("filter")||"",a=g.searchParams.get("date")||"",l=g.searchParams.get("sort")||"recent",p=parseInt(g.searchParams.get("page")||"1"),_=50,f=(p-1)*_,u=l==="updated"?"updated_at DESC, id DESC":"COALESCE(created_at, updated_at) DESC, id DESC",m,k;r==="new_match"&&a?(m=`SELECT * FROM works WHERE first_matched_date = ? AND match_source IN ('auto_claude', 'auto_tmdb') ORDER BY ${u} LIMIT ? OFFSET ?`,k=[a,_,f]):s?(m=`SELECT * FROM works WHERE title_ko LIKE ? OR title_en LIKE ? ORDER BY ${u} LIMIT ? OFFSET ?`,k=[`%${s}%`,`%${s}%`,_,f]):(m=`SELECT * FROM works ORDER BY ${u} LIMIT ? OFFSET ?`,k=[_,f]);let{results:E}=await t.DB.prepare(m).bind(...k).all();return new Response(JSON.stringify({ok:!0,data:E}),{headers:e})}catch(s){return new Response(JSON.stringify({ok:!1,message:s.message}),{status:500,headers:e})}}if(d.match(/^\/admin\/works\/\d+$/)&&i.method==="PATCH"){if(!b(i,t))return new Response(JSON.stringify({ok:!1,message:"Unauthorized"}),{status:401,headers:e});try{let s=parseInt(d.split("/")[3]),r=await i.json(),{title_ko:a,title_en:l,poster_path:p,delete_duplicates:_,media_type:f,mbti_tags:u}=r,m=f==="tv"||f==="movie"?f:null,k=u!==void 0,E=k?u||null:void 0,w=await t.DB.prepare("SELECT title_ko, title_en, poster_path, media_type FROM works WHERE tmdb_id = ?").bind(s).first();if(_&&(l||w?.title_en)){let y=l||w?.title_en;await t.DB.prepare("DELETE FROM works WHERE title_en = ? AND tmdb_id != ?").bind(y,s).run(),await t.DB.prepare("INSERT INTO admin_logs (action, target_id, before_value, memo) VALUES ('works_delete', ?, ?, ?)").bind(String(s),JSON.stringify({title_en:y}),`\uC911\uBCF5 \uC0AD\uC81C: title_en="${y}" tmdb_id!=${s}`).run()}return await t.DB.prepare(`
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
      `).bind(a||null,l||null,p||null,m,...k?[E]:[],s).run(),await t.DB.prepare("INSERT INTO admin_logs (action, target_id, before_value, after_value) VALUES ('works_update', ?, ?, ?)").bind(String(s),JSON.stringify(w),JSON.stringify(r)).run(),new Response(JSON.stringify({ok:!0}),{headers:e})}catch(s){return new Response(JSON.stringify({ok:!1,message:s.message}),{status:500,headers:e})}}if(d.match(/^\/admin\/works\/\d+\/hero-backdrop$/)&&i.method==="PATCH"){if(!b(i,t))return new Response(JSON.stringify({ok:!1,message:"Unauthorized"}),{status:401,headers:e});try{let s=parseInt(d.split("/")[3]),r=await i.json(),{backdrop_path:a,hero_title_baked_in:l}=r,p=l===void 0?null:l?1:0;return await t.DB.prepare("UPDATE works SET hero_backdrop_path = ?, hero_title_baked_in = COALESCE(?, hero_title_baked_in) WHERE tmdb_id = ?").bind(a||null,p,s).run(),new Response(JSON.stringify({ok:!0}),{headers:e})}catch(s){return new Response(JSON.stringify({ok:!1,message:s.message}),{status:500,headers:e})}}if(d.match(/^\/admin\/works\/\d+$/)&&i.method==="DELETE"){if(!b(i,t))return new Response(JSON.stringify({ok:!1,message:"Unauthorized"}),{status:401,headers:e});try{let s=parseInt(d.split("/")[3]),r=await t.DB.prepare("SELECT * FROM works WHERE tmdb_id = ?").bind(s).first();return await t.DB.prepare("DELETE FROM works WHERE tmdb_id = ?").bind(s).run(),await t.DB.prepare("INSERT INTO admin_logs (action, target_id, before_value) VALUES ('works_delete', ?, ?)").bind(String(s),JSON.stringify(r)).run(),new Response(JSON.stringify({ok:!0}),{headers:e})}catch(s){return new Response(JSON.stringify({ok:!1,message:s.message}),{status:500,headers:e})}}if(d==="/admin/new-match-count"&&i.method==="GET"){if(!b(i,t))return new Response(JSON.stringify({ok:!1,message:"Unauthorized"}),{status:401,headers:e});try{let s=g.searchParams.get("date")||new Date().toISOString().slice(0,10),r=await t.DB.prepare("SELECT COUNT(*) as count FROM works WHERE first_matched_date = ? AND match_source IN ('auto_claude','auto_tmdb')").bind(s).first();return new Response(JSON.stringify({ok:!0,count:r?.count||0,date:s}),{headers:e})}catch(s){return new Response(JSON.stringify({ok:!1,message:s.message}),{status:500,headers:e})}}if(d==="/admin/manual-rankings"&&i.method==="GET"){if(!b(i,t))return new Response(JSON.stringify({ok:!1,message:"Unauthorized"}),{status:401,headers:e});try{let s=g.searchParams.get("platform"),r=g.searchParams.get("category_slot");if(!s||!r)return new Response(JSON.stringify({ok:!1,message:"platform, category_slot required"}),{status:400,headers:e});let{results:a}=await t.DB.prepare(`
        SELECT id, rank, title_ko, title_en, tmdb_id, poster_path,
               genre, overview, release_year, tmdb_rating, source_name, memo, season
        FROM rankings
        WHERE date = 'manual' AND platform = ? AND category_slot = ?
        ORDER BY rank ASC
      `).bind(s,r).all();return new Response(JSON.stringify({ok:!0,data:a}),{headers:e})}catch(s){return new Response(JSON.stringify({ok:!1,message:s.message}),{status:500,headers:e})}}if(d==="/admin/manual-rankings"&&i.method==="POST"){if(!b(i,t))return new Response(JSON.stringify({ok:!1,message:"Unauthorized"}),{status:401,headers:e});try{let s=await i.json(),{platform:r,category_slot:a,source_name:l,tmdb_id:p,rank:_,memo:f}=s,u=s.season!==void 0?s.season:null;if(!r||!a||!p||!_)return new Response(JSON.stringify({ok:!1,message:"platform, category_slot, tmdb_id, rank required"}),{status:400,headers:e});let m=s.title_ko||"",k=s.title_en||"",E=s.poster_path||null,w=s.genre||null,y=s.overview||null,O=s.release_year||null,N=s.tmdb_rating??null,R=s.media_type==="tv"||s.media_type==="movie"?s.media_type:null;if(!m||!E||!k){let S=await t.DB.prepare("SELECT * FROM works WHERE tmdb_id = ?").bind(parseInt(p)).first();S&&(m=m||S.title_ko||"",k=k||S.title_en||"",E=E||S.poster_path||null,w=w||S.genre||null,y=y||S.overview||null,O=O||S.release_year||null,N=N??S.tmdb_rating??null)}if(!k)try{let S=R?[R]:["tv","movie"];for(let T of S){let L=await fetch(`https://api.themoviedb.org/3/${T}/${p}?language=en-US&api_key=${t.TMDB_API_KEY}`);if(!L.ok)continue;let C=await L.json();if(!C.name&&!C.title)continue;let I=C.original_title||C.original_name||"",B=C.title||C.name||"";k=/[\uAC00-\uD7A3]/.test(I)?B:I||B;break}}catch{}await t.DB.prepare(`
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
      `).bind(r,a,a,l||"",parseInt(_),m,k,parseInt(p),E,w,y,O,N,f||null,u!==null?parseInt(u):null).run();let D=new Date().toISOString();return await t.DB.prepare(`
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
      `).bind(parseInt(p),m||"",k||"",E,N,D).run(),await t.DB.prepare("INSERT INTO admin_logs (action, platform, category_slot, target_id, after_value) VALUES ('manual_ranking_add', ?, ?, ?, ?)").bind(r,a,String(p),JSON.stringify({rank:_,title_ko:m,title_en:k,memo:f})).run(),new Response(JSON.stringify({ok:!0,data:{title_ko:m,title_en:k,poster_path:E,genre:w,release_year:O,tmdb_rating:N}}),{headers:e})}catch(s){return new Response(JSON.stringify({ok:!1,message:s.message}),{status:500,headers:e})}}if(d==="/admin/manual-rankings/reorder"&&i.method==="PATCH"){if(!b(i,t))return new Response(JSON.stringify({ok:!1,message:"Unauthorized"}),{status:401,headers:e});try{let s=await i.json(),{platform:r,category_slot:a,items:l}=s;if(!r||!a||!Array.isArray(l))return new Response(JSON.stringify({ok:!1,message:"platform, category_slot, items required"}),{status:400,headers:e});let p=l.map(f=>t.DB.prepare("UPDATE rankings SET rank = ? WHERE id = ? AND date = 'manual'").bind(-parseInt(f.rank),parseInt(f.id)));await t.DB.batch(p);let _=l.map(f=>t.DB.prepare("UPDATE rankings SET rank = ?, memo = ?, season = ? WHERE id = ? AND date = 'manual'").bind(parseInt(f.rank),f.memo??null,f.season!==void 0&&f.season!==null?parseInt(f.season):null,parseInt(f.id)));return await t.DB.batch(_),await t.DB.prepare("INSERT INTO admin_logs (action, platform, category_slot, after_value) VALUES ('manual_ranking_reorder', ?, ?, ?)").bind(r,a,JSON.stringify(l)).run(),new Response(JSON.stringify({ok:!0}),{headers:e})}catch(s){return new Response(JSON.stringify({ok:!1,message:s.message}),{status:500,headers:e})}}if(d.match(/^\/admin\/manual-rankings\/\d+$/)&&i.method==="DELETE"){if(!b(i,t))return new Response(JSON.stringify({ok:!1,message:"Unauthorized"}),{status:401,headers:e});try{let s=parseInt(d.split("/")[3]),r=await t.DB.prepare("SELECT * FROM rankings WHERE id = ? AND date = 'manual'").bind(s).first();return r?(await t.DB.prepare("DELETE FROM rankings WHERE id = ? AND date = 'manual'").bind(s).run(),await t.DB.prepare("INSERT INTO admin_logs (action, platform, category_slot, target_id, before_value) VALUES ('manual_ranking_delete', ?, ?, ?, ?)").bind(r.platform,r.category_slot,String(r.tmdb_id),JSON.stringify({rank:r.rank,title_ko:r.title_ko,memo:r.memo})).run(),new Response(JSON.stringify({ok:!0}),{headers:e})):new Response(JSON.stringify({ok:!1,message:"Not found or not a manual ranking"}),{status:404,headers:e})}catch(s){return new Response(JSON.stringify({ok:!1,message:s.message}),{status:500,headers:e})}}if(d==="/admin/rankings/reorder"&&i.method==="PATCH"){if(!b(i,t))return new Response(JSON.stringify({ok:!1,message:"Unauthorized"}),{status:401,headers:e});try{let s=await i.json(),{date:r,platform:a,category_slot:l,items:p}=s;if(!r||!a||!l||!Array.isArray(p))return new Response(JSON.stringify({ok:!1,message:"date, platform, category_slot, items required"}),{status:400,headers:e});let _=p.map(u=>t.DB.prepare("UPDATE rankings SET rank = ? WHERE id = ? AND date = ? AND platform = ? AND category_slot = ?").bind(-parseInt(u.rank),parseInt(u.id),r,a,l));await t.DB.batch(_);let f=p.map(u=>t.DB.prepare("UPDATE rankings SET rank = ? WHERE id = ? AND date = ? AND platform = ? AND category_slot = ?").bind(parseInt(u.rank),parseInt(u.id),r,a,l));return await t.DB.batch(f),await t.DB.prepare("INSERT INTO admin_logs (action, platform, category_slot, after_value) VALUES ('ranking_reorder', ?, ?, ?)").bind(a,l,JSON.stringify(p)).run(),new Response(JSON.stringify({ok:!0}),{headers:e})}catch(s){return new Response(JSON.stringify({ok:!1,message:s.message}),{status:500,headers:e})}}if(d==="/admin/sync-ratings"&&i.method==="PATCH"){if(!b(i,t))return new Response(JSON.stringify({ok:!1,message:"Unauthorized"}),{status:401,headers:e});try{let{results:s}=await t.DB.prepare(`
        SELECT r.id, r.tmdb_id
        FROM rankings r
        JOIN works w ON r.tmdb_id = w.tmdb_id
        WHERE r.tmdb_rating IS NULL AND r.tmdb_id IS NOT NULL AND w.tmdb_rating IS NOT NULL
        LIMIT 500
      `).all();if(!s.length)return new Response(JSON.stringify({ok:!0,updated:0,message:"\uB3D9\uAE30\uD654\uD560 \uB370\uC774\uD130 \uC5C6\uC74C"}),{headers:e});let r=s.map(a=>t.DB.prepare("UPDATE rankings SET tmdb_rating = (SELECT tmdb_rating FROM works WHERE tmdb_id = ?) WHERE id = ?").bind(a.tmdb_id,a.id));return await t.DB.batch(r),new Response(JSON.stringify({ok:!0,updated:s.length}),{headers:e})}catch(s){return new Response(JSON.stringify({ok:!1,message:s.message}),{status:500,headers:e})}}if(d==="/admin/works/collect-keywords"&&i.method==="POST"){if(!b(i,t))return new Response(JSON.stringify({ok:!1,message:"Unauthorized"}),{status:401,headers:e});try{let s=await i.json().catch(()=>({})),r=Math.min(parseInt(s.limit)||20,50),{results:a}=await t.DB.prepare(`
        SELECT tmdb_id, media_type FROM works
        WHERE keywords IS NULL OR keywords = ''
        LIMIT ?
      `).bind(r).all();if(!a.length)return new Response(JSON.stringify({ok:!0,processed:0,attempted:0,remaining:0,message:"\uC218\uC9D1\uD560 \uC791\uD488 \uC5C6\uC74C"}),{headers:e});let l=0,p=0,_=[];for(let u of a){let m=u.media_type?[u.media_type]:["tv","movie"],k="",E=!1;for(let w of m)try{let y=await fetch(`https://api.themoviedb.org/3/${w}/${u.tmdb_id}/keywords?api_key=${t.TMDB_API_KEY}`);if(!y.ok)continue;E=!0;let O=await y.json(),N=O.keywords||O.results||[];if(N.length){k=N.map(R=>R.name).filter(Boolean).join(",");break}}catch{}k?(_.push(t.DB.prepare("UPDATE works SET keywords = ? WHERE tmdb_id = ?").bind(k,u.tmdb_id)),l++):E?_.push(t.DB.prepare("UPDATE works SET keywords = ? WHERE tmdb_id = ?").bind("__NONE__",u.tmdb_id)):p++}_.length&&await t.DB.batch(_);let f=await t.DB.prepare("SELECT COUNT(*) as cnt FROM works WHERE keywords IS NULL OR keywords = ''").first();return new Response(JSON.stringify({ok:!0,processed:l,attempted:a.length,skippedRetry:p,remaining:f?.cnt||0}),{headers:e})}catch(s){return new Response(JSON.stringify({ok:!1,message:s.message}),{status:500,headers:e})}}if(d==="/admin/works/backfill-normalize-keywords"&&i.method==="POST"){if(!b(i,t))return new Response(JSON.stringify({ok:!1,message:"Unauthorized"}),{status:401,headers:e});try{let s=await i.json().catch(()=>({})),r=Math.min(parseInt(s.limit)||200,300),{results:a}=await t.DB.prepare(`
        SELECT tmdb_id, keywords FROM works
        WHERE keywords_normalized_at IS NULL
          AND keywords IS NOT NULL AND keywords != ''
        LIMIT ?
      `).bind(r).all();if(!a.length)return new Response(JSON.stringify({ok:!0,processed:0,attempted:0,remaining:0,message:"\uC815\uADDC\uD654\uD560 \uC791\uD488 \uC5C6\uC74C"}),{headers:e});let l=[],p=0,_=new Date().toISOString();for(let u of a){if(u.keywords&&u.keywords!=="__NONE__"){let m=new Set(u.keywords.split(",").map(k=>k.trim().toLowerCase()).filter(Boolean));if(m.size){for(let k of m)l.push(t.DB.prepare("INSERT OR IGNORE INTO work_keywords (tmdb_id, keyword) VALUES (?, ?)").bind(u.tmdb_id,k)),l.push(t.DB.prepare("INSERT OR IGNORE INTO keyword_translation (keyword_en) VALUES (?)").bind(k));p++}}l.push(t.DB.prepare("UPDATE works SET keywords_normalized_at = ? WHERE tmdb_id = ?").bind(_,u.tmdb_id))}l.length&&await t.DB.batch(l);let f=await t.DB.prepare(`
        SELECT COUNT(*) as cnt FROM works
        WHERE keywords_normalized_at IS NULL
          AND keywords IS NOT NULL AND keywords != ''
      `).first();return new Response(JSON.stringify({ok:!0,processed:p,attempted:a.length,remaining:f?.cnt||0}),{headers:e})}catch(s){return new Response(JSON.stringify({ok:!1,message:s.message}),{status:500,headers:e})}}if(d==="/admin/keywords/translate"&&i.method==="POST"){if(!b(i,t))return new Response(JSON.stringify({ok:!1,message:"Unauthorized"}),{status:401,headers:e});if(!t.ANTHROPIC_API_KEY)return new Response(JSON.stringify({ok:!1,message:"ANTHROPIC_API_KEY\uAC00 Workers Secrets\uC5D0 \uC124\uC815\uB418\uC5B4 \uC788\uC9C0 \uC54A\uC2B5\uB2C8\uB2E4"}),{status:500,headers:e});try{let s=await i.json().catch(()=>({})),r=Math.min(parseInt(s.limit)||40,60),{results:a}=await t.DB.prepare(`
        SELECT keyword_en FROM keyword_translation
        WHERE source IS NULL
          AND (translate_attempts IS NULL OR translate_attempts < 3)
        LIMIT ?
      `).bind(r).all();if(!a.length)return new Response(JSON.stringify({ok:!0,attempted:0,translated:0,remaining:0,message:"\uBC88\uC5ED\uD560 \uD0A4\uC6CC\uB4DC \uC5C6\uC74C"}),{headers:e});let l=a.map(R=>`- ${R.keyword_en}`).join(`
`),p='\uB108\uB294 TMDB \uC601\uBB38 \uC791\uD488 \uD0A4\uC6CC\uB4DC(\uD14C\uB9C8/\uBD84\uC704\uAE30 \uD0DC\uADF8)\uB97C \uD55C\uAD6D OTT \uC11C\uBE44\uC2A4 \uC0AC\uC6A9\uC790\uC6A9\uC73C\uB85C \uBC88\uC5ED\uD558\uB294 \uB3C4\uC6B0\uBBF8\uB2E4. \uAC01 \uC601\uBB38 \uD0A4\uC6CC\uB4DC\uB97C \uC790\uC5F0\uC2A4\uB7FD\uACE0 \uAC04\uACB0\uD55C \uD55C\uAD6D\uC5B4 \uBA85\uC0AC\uAD6C(\uB300\uB7B5 2~8\uC790)\uB85C \uBC88\uC5ED\uD574\uB77C. \uC9C1\uC5ED\uBCF4\uB2E4 \uD55C\uAD6D \uC2DC\uCCAD\uC790\uC5D0\uAC8C \uC775\uC219\uD55C \uD45C\uD604\uC744 \uC6B0\uC120\uD574\uB77C(\uC608: revenge\u2192\uBCF5\uC218, chaebol\u2192\uC7AC\uBC8C, coming of age\u2192\uC131\uC7A5). \uC124\uBA85\uC774\uB098 \uBD80\uC5F0 \uC5C6\uC774, \uC694\uCCAD\uBC1B\uC740 \uD0A4\uC6CC\uB4DC \uC804\uBD80\uC5D0 \uB300\uD574 1:1\uB85C \uBC88\uC5ED\uD574\uB77C. \uBC18\uB4DC\uC2DC JSON \uBC30\uC5F4\uB9CC \uCD9C\uB825\uD558\uACE0, \uB2E4\uB978 \uC124\uBA85\uC774\uB098 \uCF54\uB4DC\uBE14\uB85D(```)\uC740 \uC808\uB300 \uD3EC\uD568\uD558\uC9C0 \uB9C8\uB77C. \uCD9C\uB825 \uD615\uC2DD: [{"keyword_en":"revenge","keyword_ko":"\uBCF5\uC218"}, ...]',_=`\uBC88\uC5ED\uD560 \uD0A4\uC6CC\uB4DC \uBAA9\uB85D:
${l}`,f=await fetch("https://api.anthropic.com/v1/messages",{method:"POST",headers:{"Content-Type":"application/json","x-api-key":t.ANTHROPIC_API_KEY,"anthropic-version":"2023-06-01"},body:JSON.stringify({model:"claude-haiku-4-5-20251001",max_tokens:3e3,system:p,messages:[{role:"user",content:_}]})});if(!f.ok){let R=await f.text().catch(()=>"");return new Response(JSON.stringify({ok:!1,message:`Claude API \uC624\uB958 (status ${f.status})`,detail:R.slice(0,300)}),{status:502,headers:e})}let m=((await f.json()).content||[]).filter(R=>R.type==="text").map(R=>R.text).join(""),k;try{let R=m.replace(/```json|```/g,"").trim();k=JSON.parse(R)}catch{return new Response(JSON.stringify({ok:!1,message:"Claude \uC751\uB2F5 \uD30C\uC2F1 \uC2E4\uD328 \u2014 \uB2E4\uC2DC \uC2DC\uB3C4\uD574\uC8FC\uC138\uC694",raw:m.slice(0,300)}),{status:502,headers:e})}Array.isArray(k)||(k=[]);let E=new Set(a.map(R=>R.keyword_en)),w=new Map;for(let R of k){let D=(R.keyword_en||"").trim().toLowerCase(),S=(R.keyword_ko||"").trim();!D||!S||!E.has(D)||w.set(D,S)}let y=[],O=0;for(let R of a){if(!w.has(R.keyword_en)){y.push(t.DB.prepare("UPDATE keyword_translation SET translate_attempts = COALESCE(translate_attempts, 0) + 1 WHERE keyword_en = ? AND source IS NULL").bind(R.keyword_en));continue}y.push(t.DB.prepare("UPDATE keyword_translation SET keyword_ko = ?, source = 'auto' WHERE keyword_en = ? AND source IS NULL").bind(w.get(R.keyword_en),R.keyword_en)),O++}y.length&&await t.DB.batch(y);let N=await t.DB.prepare(`
        SELECT
          SUM(CASE WHEN source IS NULL AND (translate_attempts IS NULL OR translate_attempts < 3) THEN 1 ELSE 0 END) AS remaining,
          SUM(CASE WHEN source IS NULL AND translate_attempts >= 3 THEN 1 ELSE 0 END) AS stuck
        FROM keyword_translation
      `).first();return new Response(JSON.stringify({ok:!0,attempted:a.length,translated:O,remaining:N?.remaining||0,stuck:N?.stuck||0}),{headers:e})}catch(s){return new Response(JSON.stringify({ok:!1,message:s.message}),{status:500,headers:e})}}if(d==="/admin/keywords/review"&&i.method==="GET"){if(!b(i,t))return new Response(JSON.stringify({ok:!1,message:"Unauthorized"}),{status:401,headers:e});try{let s=Math.min(parseInt(g.searchParams.get("limit"))||30,60),{results:r}=await t.DB.prepare(`
        SELECT id, keyword_en, keyword_ko
        FROM keyword_translation
        WHERE source = 'auto'
        ORDER BY id ASC
        LIMIT ?
      `).bind(s).all(),a=await t.DB.prepare("SELECT COUNT(*) as cnt FROM keyword_translation WHERE source = 'auto'").first();return new Response(JSON.stringify({ok:!0,items:r,remaining:a?.cnt||0}),{headers:e})}catch(s){return new Response(JSON.stringify({ok:!1,message:s.message}),{status:500,headers:e})}}if(d==="/admin/keywords/review"&&i.method==="POST"){if(!b(i,t))return new Response(JSON.stringify({ok:!1,message:"Unauthorized"}),{status:401,headers:e});try{let s=await i.json().catch(()=>({})),a=(Array.isArray(s.items)?s.items:[]).filter(_=>_&&_.id&&typeof _.keyword_ko=="string"&&_.keyword_ko.trim());if(!a.length)return new Response(JSON.stringify({ok:!1,message:"\uC720\uD6A8\uD55C \uD56D\uBAA9\uC774 \uC5C6\uC5B4\uC694"}),{status:400,headers:e});let l=a.map(_=>t.DB.prepare("UPDATE keyword_translation SET keyword_ko = ?, source = 'admin' WHERE id = ?").bind(_.keyword_ko.trim(),parseInt(_.id)));await t.DB.batch(l);let p=await t.DB.prepare("SELECT COUNT(*) as cnt FROM keyword_translation WHERE source = 'auto'").first();return new Response(JSON.stringify({ok:!0,updated:a.length,remaining:p?.cnt||0}),{headers:e})}catch(s){return new Response(JSON.stringify({ok:!1,message:s.message}),{status:500,headers:e})}}if(d==="/admin/keywords/search"&&i.method==="GET"){if(!b(i,t))return new Response(JSON.stringify({ok:!1,message:"Unauthorized"}),{status:401,headers:e});try{let s=(g.searchParams.get("q")||"").trim();if(!s)return new Response(JSON.stringify({ok:!1,message:"\uAC80\uC0C9\uC5B4(q)\uAC00 \uD544\uC694\uD574\uC694"}),{status:400,headers:e});let r=`%${s}%`,{results:a}=await t.DB.prepare(`
        SELECT id, keyword_en, keyword_ko, source
        FROM keyword_translation
        WHERE keyword_en LIKE ? OR keyword_ko LIKE ?
        ORDER BY keyword_en ASC
        LIMIT 50
      `).bind(r,r).all();return new Response(JSON.stringify({ok:!0,items:a}),{headers:e})}catch(s){return new Response(JSON.stringify({ok:!1,message:s.message}),{status:500,headers:e})}}if(d==="/admin/keywords/update"&&i.method==="POST"){if(!b(i,t))return new Response(JSON.stringify({ok:!1,message:"Unauthorized"}),{status:401,headers:e});try{let s=await i.json().catch(()=>({})),r=(s.keyword_en||"").trim(),a=(s.keyword_ko||"").trim();if(!r||!a)return new Response(JSON.stringify({ok:!1,message:"keyword_en, keyword_ko \uBAA8\uB450 \uD544\uC694\uD574\uC694"}),{status:400,headers:e});let l=await t.DB.prepare("UPDATE keyword_translation SET keyword_ko = ?, source = 'admin' WHERE keyword_en = ?").bind(a,r).run();return!l.meta||l.meta.changes===0?new Response(JSON.stringify({ok:!1,message:"\uD574\uB2F9 keyword_en\uC744 \uCC3E\uC9C0 \uBABB\uD588\uC5B4\uC694"}),{status:404,headers:e}):new Response(JSON.stringify({ok:!0}),{headers:e})}catch(s){return new Response(JSON.stringify({ok:!1,message:s.message}),{status:500,headers:e})}}if(d==="/admin/works/discover-collect"&&i.method==="POST"){if(!b(i,t))return new Response(JSON.stringify({ok:!1,message:"Unauthorized"}),{status:401,headers:e});try{let s=await i.json().catch(()=>({})),r=s.media_type,a=Math.max(parseInt(s.page)||1,1);if(!["movie","tv"].includes(r))return new Response(JSON.stringify({ok:!1,message:"media_type\uC740 'movie' \uB610\uB294 'tv'\uB9CC \uD5C8\uC6A9"}),{status:400,headers:e});let l=r==="movie"?`https://api.themoviedb.org/3/discover/movie?api_key=${t.TMDB_API_KEY}&language=ko-KR&region=KR&with_original_language=ko&sort_by=popularity.desc&page=${a}`:`https://api.themoviedb.org/3/discover/tv?api_key=${t.TMDB_API_KEY}&language=ko-KR&with_origin_country=KR&sort_by=popularity.desc&page=${a}`,p=await fetch(l);if(!p.ok)return new Response(JSON.stringify({ok:!1,message:`TMDB discover \uC870\uD68C \uC2E4\uD328 (status ${p.status})`}),{status:502,headers:e});let _=await p.json(),f=_.results||[],u=_.total_pages||1;if(!f.length)return new Response(JSON.stringify({ok:!0,attempted:0,inserted:0,skipped:0,hasNextPage:!1,nextPage:a+1,totalPages:u}),{headers:e});let m=f.map(R=>R.id),k=m.map(()=>"?").join(","),{results:E}=await t.DB.prepare(`SELECT tmdb_id FROM works WHERE tmdb_id IN (${k})`).bind(...m).all(),w=new Set((E||[]).map(R=>R.tmdb_id)),y=f.filter(R=>!w.has(R.id)),O=[],N=0;for(let R of y){let D=null,S=null,T=null,L=null,C=null,I=null,B="";try{let J=await fetch(`https://api.themoviedb.org/3/${r}/${R.id}?language=ko-KR&api_key=${t.TMDB_API_KEY}`);if(J.ok){let M=await J.json();D=M.name||M.title||R.name||R.title||null,T=M.poster_path||R.poster_path||null,L=(M.genres||[]).map(W=>W.name).join(", ")||null,C=M.vote_average?parseFloat(M.vote_average.toFixed(1)):null,I=parseInt((M.first_air_date||M.release_date||"").slice(0,4))||null,B=M.overview||R.overview||""}}catch{}if(D){try{let J=await fetch(`https://api.themoviedb.org/3/${r}/${R.id}?language=en-US&api_key=${t.TMDB_API_KEY}`);if(J.ok){let M=await J.json(),W=M.original_title||M.original_name||"",K=M.title||M.name||"";S=/[\uAC00-\uD7A3]/.test(W)?K:W||K}}catch{}O.push(t.DB.prepare(`
            INSERT INTO works
              (tmdb_id, title_ko, title_en, overview, genre, release_year,
               tmdb_rating, poster_path, media_type, match_source, confidence_score, first_matched_date)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'auto_discover', 90, date('now'))
            ON CONFLICT(tmdb_id) DO NOTHING
          `).bind(R.id,D,S||"",B||"",L||"",I,C,T,r)),N++}}return O.length&&await t.DB.batch(O),new Response(JSON.stringify({ok:!0,attempted:f.length,inserted:N,skipped:f.length-y.length,hasNextPage:a<u,nextPage:a+1,totalPages:u}),{headers:e})}catch(s){return new Response(JSON.stringify({ok:!1,message:s.message}),{status:500,headers:e})}}if(d==="/admin/works/classify-variety"&&i.method==="POST"){if(!b(i,t))return new Response(JSON.stringify({ok:!1,message:"Unauthorized"}),{status:401,headers:e});if(!t.ANTHROPIC_API_KEY)return new Response(JSON.stringify({ok:!1,message:"ANTHROPIC_API_KEY\uAC00 Workers Secrets\uC5D0 \uC124\uC815\uB418\uC5B4 \uC788\uC9C0 \uC54A\uC2B5\uB2C8\uB2E4"}),{status:500,headers:e});try{let s=await i.json().catch(()=>({})),r=Math.min(parseInt(s.limit)||10,15),{results:a}=await t.DB.prepare("SELECT label FROM variety_genre_options ORDER BY sort_order ASC").all();if(!a.length)return new Response(JSON.stringify({ok:!1,message:"variety_genre_options\uC5D0 \uD0DC\uADF8\uAC00 \uD558\uB098\uB3C4 \uC5C6\uC2B5\uB2C8\uB2E4. \uBA3C\uC800 \uD0DC\uADF8\uB97C \uB4F1\uB85D\uD574\uC8FC\uC138\uC694."}),{status:400,headers:e});let l=a.map(S=>S.label),{results:p}=await t.DB.prepare(`
        SELECT tmdb_id, title_ko, overview, genre
        FROM works
        WHERE original_language = 'ko'
          AND variety_genre_source IS NULL
          AND (
            genre LIKE '%Reality%' OR genre LIKE '%Talk%' OR
            genre LIKE '%\uB2E4\uD050\uBA58\uD130\uB9AC%' OR genre LIKE '%\uB9AC\uC5BC\uB9AC\uD2F0%' OR genre LIKE '%\uD1A0\uD06C%'
          )
        LIMIT ?
      `).bind(r).all();if(!p.length)return new Response(JSON.stringify({ok:!0,attempted:0,classified:0,remaining:0,message:"\uBD84\uB958\uD560 \uC791\uD488 \uC5C6\uC74C"}),{headers:e});let _=p.map(S=>`- tmdb_id:${S.tmdb_id} / \uC81C\uBAA9:"${S.title_ko||""}" / \uC904\uAC70\uB9AC:"${(S.overview||"").slice(0,200)}"`).join(`
`),f='\uB108\uB294 \uD55C\uAD6D \uC608\uB2A5 \uD504\uB85C\uADF8\uB7A8\uC744 \uBD84\uB958\uD558\uB294 \uB3C4\uC6B0\uBBF8\uB2E4. \uC544\uB798 \uD0DC\uADF8 \uBAA9\uB85D \uC911\uC5D0\uC11C\uB9CC \uACE8\uB77C\uC57C \uD558\uBA70, \uBAA9\uB85D\uC5D0 \uC5C6\uB294 \uD0DC\uADF8\uB294 \uC808\uB300 \uB9CC\uB4E4\uC5B4\uB0B4\uC9C0 \uB9C8\uB77C. \uAC01 \uC791\uD488\uB9C8\uB2E4 \uAC00\uC7A5 \uC5B4\uC6B8\uB9AC\uB294 \uD0DC\uADF8\uB97C \uCD5C\uB300 2\uAC1C\uAE4C\uC9C0 \uACE0\uB974\uACE0, \uC560\uB9E4\uD558\uBA74 1\uAC1C\uB9CC \uACE0\uB974\uAC70\uB098 "\uC77C\uBC18 \uC608\uB2A5"\uC744 \uC120\uD0DD\uD574\uB77C. \uC608\uB2A5\uC774 \uC544\uB2C8\uB77C\uACE0 \uD310\uB2E8\uB418\uBA74(\uB4DC\uB77C\uB9C8/\uC601\uD654/\uB2E4\uD050 \uB4F1) tags\uB97C \uBE48 \uBC30\uC5F4\uB85C \uB0A8\uACA8\uB77C. \uBC18\uB4DC\uC2DC JSON \uBC30\uC5F4\uB9CC \uCD9C\uB825\uD558\uACE0, \uB2E4\uB978 \uC124\uBA85\uC774\uB098 \uCF54\uB4DC\uBE14\uB85D(```)\uC740 \uC808\uB300 \uD3EC\uD568\uD558\uC9C0 \uB9C8\uB77C. \uCD9C\uB825 \uD615\uC2DD: [{"tmdb_id":123,"tags":["\uC5EC\uD589 \uC608\uB2A5"]}, ...]',u=`\uD0DC\uADF8 \uBAA9\uB85D: ${l.join(", ")}

\uC791\uD488 \uBAA9\uB85D:
${_}`,m=await fetch("https://api.anthropic.com/v1/messages",{method:"POST",headers:{"Content-Type":"application/json","x-api-key":t.ANTHROPIC_API_KEY,"anthropic-version":"2023-06-01"},body:JSON.stringify({model:"claude-haiku-4-5-20251001",max_tokens:2e3,system:f,messages:[{role:"user",content:u}]})});if(!m.ok){let S=await m.text().catch(()=>"");return new Response(JSON.stringify({ok:!1,message:`Claude API \uC624\uB958 (status ${m.status})`,detail:S.slice(0,300)}),{status:502,headers:e})}let E=((await m.json()).content||[]).filter(S=>S.type==="text").map(S=>S.text).join(""),w;try{let S=E.replace(/```json|```/g,"").trim();w=JSON.parse(S)}catch{return new Response(JSON.stringify({ok:!1,message:"Claude \uC751\uB2F5 \uD30C\uC2F1 \uC2E4\uD328 \u2014 \uB2E4\uC2DC \uC2DC\uB3C4\uD574\uC8FC\uC138\uC694",raw:E.slice(0,300)}),{status:502,headers:e})}Array.isArray(w)||(w=[]);let y=new Set(l),O=new Map;for(let S of w){let T=parseInt(S.tmdb_id);if(!T)continue;let L=Array.isArray(S.tags)?S.tags.filter(C=>y.has(C)).slice(0,2):[];O.set(T,L)}let N=[],R=0;for(let S of p){if(!O.has(S.tmdb_id))continue;let T=O.get(S.tmdb_id);N.push(t.DB.prepare("UPDATE works SET variety_genre = ?, variety_genre_source = 'auto' WHERE tmdb_id = ?").bind(T.length?T.join(","):null,S.tmdb_id)),R++}N.length&&await t.DB.batch(N);let D=await t.DB.prepare(`
        SELECT COUNT(*) as cnt FROM works
        WHERE original_language = 'ko' AND variety_genre_source IS NULL
          AND (genre LIKE '%Reality%' OR genre LIKE '%Talk%' OR genre LIKE '%\uB2E4\uD050\uBA58\uD130\uB9AC%' OR genre LIKE '%\uB9AC\uC5BC\uB9AC\uD2F0%' OR genre LIKE '%\uD1A0\uD06C%')
      `).first();return new Response(JSON.stringify({ok:!0,attempted:p.length,classified:R,remaining:D?.cnt||0}),{headers:e})}catch(s){return new Response(JSON.stringify({ok:!1,message:s.message}),{status:500,headers:e})}}if(d==="/admin/variety-genre-options"&&i.method==="GET"){if(!b(i,t))return new Response(JSON.stringify({ok:!1,message:"Unauthorized"}),{status:401,headers:e});try{let{results:s}=await t.DB.prepare("SELECT id, label, sort_order FROM variety_genre_options ORDER BY sort_order ASC").all();return new Response(JSON.stringify({ok:!0,data:s}),{headers:e})}catch(s){return new Response(JSON.stringify({ok:!1,message:s.message}),{status:500,headers:e})}}if(d==="/admin/works/variety-review"&&i.method==="GET"){if(!b(i,t))return new Response(JSON.stringify({ok:!1,message:"Unauthorized"}),{status:401,headers:e});try{let s=Math.min(parseInt(g.searchParams.get("limit"))||12,30),{results:r}=await t.DB.prepare(`
        SELECT tmdb_id, title_ko, poster_path, variety_genre, media_type
        FROM works
        WHERE variety_genre_source = 'auto'
        ORDER BY (variety_review_skipped_at IS NULL) DESC, variety_review_skipped_at ASC, tmdb_id ASC
        LIMIT ?
      `).bind(s).all(),a=await t.DB.prepare("SELECT COUNT(*) as cnt FROM works WHERE variety_genre_source = 'auto'").first();return new Response(JSON.stringify({ok:!0,items:r,remaining:a?.cnt||0}),{headers:e})}catch(s){return new Response(JSON.stringify({ok:!1,message:s.message}),{status:500,headers:e})}}if(d==="/admin/works/variety-review"&&i.method==="POST"){if(!b(i,t))return new Response(JSON.stringify({ok:!1,message:"Unauthorized"}),{status:401,headers:e});try{let s=await i.json().catch(()=>({})),a=(Array.isArray(s.items)?s.items:[]).filter(_=>_&&_.tmdb_id&&Array.isArray(_.tags));if(!a.length)return new Response(JSON.stringify({ok:!1,message:"\uC720\uD6A8\uD55C \uD56D\uBAA9\uC774 \uC5C6\uC5B4\uC694"}),{status:400,headers:e});let l=a.map(_=>{let f=_.tags.filter(Boolean).slice(0,2);return t.DB.prepare("UPDATE works SET variety_genre = ?, variety_genre_source = 'admin' WHERE tmdb_id = ?").bind(f.length?f.join(","):null,parseInt(_.tmdb_id))});await t.DB.batch(l);let p=await t.DB.prepare("SELECT COUNT(*) as cnt FROM works WHERE variety_genre_source = 'auto'").first();return new Response(JSON.stringify({ok:!0,updated:a.length,remaining:p?.cnt||0}),{headers:e})}catch(s){return new Response(JSON.stringify({ok:!1,message:s.message}),{status:500,headers:e})}}if(d==="/admin/works/variety-review/skip"&&i.method==="POST"){if(!b(i,t))return new Response(JSON.stringify({ok:!1,message:"Unauthorized"}),{status:401,headers:e});try{let s=await i.json().catch(()=>({})),r=Array.isArray(s.tmdb_ids)?s.tmdb_ids.map(p=>parseInt(p)).filter(p=>Number.isInteger(p)):[];if(!r.length)return new Response(JSON.stringify({ok:!1,message:"tmdb_ids required"}),{status:400,headers:e});let a=new Date().toISOString(),l=r.map(p=>t.DB.prepare("UPDATE works SET variety_review_skipped_at = ? WHERE tmdb_id = ?").bind(a,p));return await t.DB.batch(l),new Response(JSON.stringify({ok:!0,skipped:r.length}),{headers:e})}catch(s){return new Response(JSON.stringify({ok:!1,message:s.message}),{status:500,headers:e})}}if(d==="/admin/works/pinned-similar"&&i.method==="POST"){if(!b(i,t))return new Response(JSON.stringify({ok:!1,message:"Unauthorized"}),{status:401,headers:e});try{let s=await i.json().catch(()=>({})),r=parseInt(s.tmdb_id),a=parseInt(s.related_tmdb_id),l=parseInt(s.pinned_pct);if((!l||l<1||l>99)&&(l=99),!r||!a)return new Response(JSON.stringify({ok:!1,message:"\uB450 \uC791\uD488\uC758 tmdb_id\uAC00 \uBAA8\uB450 \uD544\uC694\uD569\uB2C8\uB2E4"}),{status:400,headers:e});if(r===a)return new Response(JSON.stringify({ok:!1,message:"\uAC19\uC740 \uC791\uD488\uB07C\uB9AC\uB294 \uC5F0\uACB0\uD560 \uC218 \uC5C6\uC5B4\uC694"}),{status:400,headers:e});let{results:p}=await t.DB.prepare("SELECT tmdb_id FROM works WHERE tmdb_id IN (?, ?)").bind(r,a).all();return p.length<2?new Response(JSON.stringify({ok:!1,message:"works \uD14C\uC774\uBE14\uC5D0 \uC5C6\uB294 \uC791\uD488\uC774 \uD3EC\uD568\uB418\uC5B4 \uC788\uC5B4\uC694"}),{status:400,headers:e}):(await t.DB.batch([t.DB.prepare(`
          INSERT INTO work_pinned_similar (tmdb_id, related_tmdb_id, pinned_pct)
          VALUES (?, ?, ?)
          ON CONFLICT(tmdb_id, related_tmdb_id) DO UPDATE SET pinned_pct = excluded.pinned_pct
        `).bind(r,a,l),t.DB.prepare(`
          INSERT INTO work_pinned_similar (tmdb_id, related_tmdb_id, pinned_pct)
          VALUES (?, ?, ?)
          ON CONFLICT(tmdb_id, related_tmdb_id) DO UPDATE SET pinned_pct = excluded.pinned_pct
        `).bind(a,r,l)]),new Response(JSON.stringify({ok:!0,pinned_pct:l}),{headers:e}))}catch(s){return new Response(JSON.stringify({ok:!1,message:s.message}),{status:500,headers:e})}}if(d.startsWith("/admin/works/pinned-similar/")&&i.method==="GET"){if(!b(i,t))return new Response(JSON.stringify({ok:!1,message:"Unauthorized"}),{status:401,headers:e});try{let s=parseInt(d.split("/admin/works/pinned-similar/")[1]);if(!s)return new Response(JSON.stringify({ok:!1,message:"tmdb_id required"}),{status:400,headers:e});let{results:r}=await t.DB.prepare(`
        SELECT w.tmdb_id, w.title_ko, w.title_en, w.poster_path, p.pinned_pct
        FROM work_pinned_similar p
        JOIN works w ON w.tmdb_id = p.related_tmdb_id
        WHERE p.tmdb_id = ?
        ORDER BY p.pinned_pct DESC
      `).bind(s).all();return new Response(JSON.stringify({ok:!0,data:r}),{headers:e})}catch(s){return new Response(JSON.stringify({ok:!1,message:s.message}),{status:500,headers:e})}}if(d==="/admin/works/pinned-similar"&&i.method==="DELETE"){if(!b(i,t))return new Response(JSON.stringify({ok:!1,message:"Unauthorized"}),{status:401,headers:e});try{let s=await i.json().catch(()=>({})),r=parseInt(s.tmdb_id),a=parseInt(s.related_tmdb_id);return!r||!a?new Response(JSON.stringify({ok:!1,message:"\uB450 \uC791\uD488\uC758 tmdb_id\uAC00 \uBAA8\uB450 \uD544\uC694\uD569\uB2C8\uB2E4"}),{status:400,headers:e}):(await t.DB.prepare(`
        DELETE FROM work_pinned_similar
        WHERE (tmdb_id = ? AND related_tmdb_id = ?) OR (tmdb_id = ? AND related_tmdb_id = ?)
      `).bind(r,a,a,r).run(),new Response(JSON.stringify({ok:!0}),{headers:e}))}catch(s){return new Response(JSON.stringify({ok:!1,message:s.message}),{status:500,headers:e})}}if(d==="/admin/persons/collect"&&i.method==="POST"){if(!b(i,t))return new Response(JSON.stringify({ok:!1,message:"Unauthorized"}),{status:401,headers:e});try{let s=await i.json().catch(()=>({})),r=Math.min(parseInt(s.limit)||20,50),{results:a}=await t.DB.prepare(`
        SELECT tmdb_id, media_type FROM works
        WHERE credits_scanned IS NULL OR credits_scanned = 0
        LIMIT ?
      `).bind(r).all();if(!a.length)return new Response(JSON.stringify({ok:!0,worksScanned:0,personsFound:0,remaining:0,message:"\uC2A4\uCE94\uD560 \uC791\uD488 \uC5C6\uC74C"}),{headers:e});let l=new Map,p=[];for(let u of a){p.push(u.tmdb_id);let m=u.media_type==="tv"?"tv":"movie",k=m==="tv"?"aggregate_credits":"credits";try{let E=await fetch(`https://api.themoviedb.org/3/${m}/${u.tmdb_id}/${k}?api_key=${t.TMDB_API_KEY}`);if(!E.ok)continue;let w=await E.json();for(let y of(w.cast||[]).slice(0,15))y.id&&y.name&&!l.has(y.id)&&l.set(y.id,{name:y.name,job:"act"});for(let y of w.crew||[])(y.job==="Director"||y.job==="Creator"||y.department==="Directing"||(y.jobs||[]).some(N=>N.job==="Director"||N.job==="Creator"))&&y.id&&y.name&&l.set(y.id,{name:y.name,job:"direct"})}catch{}}let _=[];for(let[u,m]of l)_.push(t.DB.prepare(`INSERT INTO persons (tmdb_id, name, job) VALUES (?, ?, ?)
             ON CONFLICT(tmdb_id) DO NOTHING`).bind(u,m.name,m.job));for(let u of p)_.push(t.DB.prepare("UPDATE works SET credits_scanned = 1 WHERE tmdb_id = ?").bind(u));_.length&&await t.DB.batch(_);let f=await t.DB.prepare("SELECT COUNT(*) as cnt FROM works WHERE credits_scanned IS NULL OR credits_scanned = 0").first();return new Response(JSON.stringify({ok:!0,worksScanned:a.length,personsFound:l.size,remaining:f?.cnt||0}),{headers:e})}catch(s){return new Response(JSON.stringify({ok:!1,message:s.message}),{status:500,headers:e})}}if(d==="/admin/works/backfill-language"&&i.method==="POST"){if(!b(i,t))return new Response(JSON.stringify({ok:!1,message:"Unauthorized"}),{status:401,headers:e});try{let s=await i.json().catch(()=>({})),r=Math.min(parseInt(s.limit)||30,50),{results:a}=await t.DB.prepare(`
        SELECT tmdb_id, media_type FROM works
        WHERE original_language IS NULL
        LIMIT ?
      `).bind(r).all();if(!a.length)return new Response(JSON.stringify({ok:!0,attempted:0,filled:0,remaining:0,message:"\uCC44\uC6B8 \uC791\uD488 \uC5C6\uC74C"}),{headers:e});let l=[],p=0;for(let f of a){let u=f.media_type?[f.media_type]:["tv","movie"],m=null;for(let k of u)try{let E=await fetch(`https://api.themoviedb.org/3/${k}/${f.tmdb_id}?api_key=${t.TMDB_API_KEY}`);if(!E.ok)continue;let w=await E.json();if(w.original_language){m=w.original_language;break}}catch{}m?(l.push(t.DB.prepare("UPDATE works SET original_language = ? WHERE tmdb_id = ?").bind(m,f.tmdb_id)),p++):l.push(t.DB.prepare("UPDATE works SET original_language = 'unknown' WHERE tmdb_id = ?").bind(f.tmdb_id))}l.length&&await t.DB.batch(l);let _=await t.DB.prepare("SELECT COUNT(*) as cnt FROM works WHERE original_language IS NULL").first();return new Response(JSON.stringify({ok:!0,attempted:a.length,filled:p,remaining:_?.cnt||0}),{headers:e})}catch(s){return new Response(JSON.stringify({ok:!1,message:s.message}),{status:500,headers:e})}}if(d==="/admin/works/backfill-release-year"&&i.method==="POST"){if(!b(i,t))return new Response(JSON.stringify({ok:!1,message:"Unauthorized"}),{status:401,headers:e});try{let s=await i.json().catch(()=>({})),r=Math.min(parseInt(s.limit)||30,50),{results:a}=await t.DB.prepare(`
        SELECT tmdb_id, media_type FROM works
        WHERE release_year IS NULL
        LIMIT ?
      `).bind(r).all();if(!a.length)return new Response(JSON.stringify({ok:!0,attempted:0,filled:0,remaining:0,message:"\uCC44\uC6B8 \uC791\uD488 \uC5C6\uC74C"}),{headers:e});let l=[],p=0;for(let f of a){let u=f.media_type?[f.media_type]:["tv","movie"],m=null;for(let k of u)try{let E=await fetch(`https://api.themoviedb.org/3/${k}/${f.tmdb_id}?api_key=${t.TMDB_API_KEY}`);if(!E.ok)continue;let w=await E.json(),y=w.release_date||w.first_air_date||"",O=parseInt(y.slice(0,4));if(O){m=O;break}}catch{}m?(l.push(t.DB.prepare("UPDATE works SET release_year = ? WHERE tmdb_id = ?").bind(m,f.tmdb_id)),p++):l.push(t.DB.prepare("UPDATE works SET release_year = 0 WHERE tmdb_id = ?").bind(f.tmdb_id))}l.length&&await t.DB.batch(l);let _=await t.DB.prepare("SELECT COUNT(*) as cnt FROM works WHERE release_year IS NULL").first();return new Response(JSON.stringify({ok:!0,attempted:a.length,filled:p,remaining:_?.cnt||0}),{headers:e})}catch(s){return new Response(JSON.stringify({ok:!1,message:s.message}),{status:500,headers:e})}}if(d==="/admin/works/backfill-rating"&&i.method==="POST"){if(!b(i,t))return new Response(JSON.stringify({ok:!1,message:"Unauthorized"}),{status:401,headers:e});try{let s=await i.json().catch(()=>({})),r=Math.min(parseInt(s.limit)||30,50),{results:a}=await t.DB.prepare(`
        SELECT tmdb_id, media_type FROM works
        WHERE tmdb_rating IS NULL AND rating_updated_at IS NULL
        LIMIT ?
      `).bind(r).all();if(!a.length)return new Response(JSON.stringify({ok:!0,attempted:0,filled:0,remaining:0,message:"\uCC44\uC6B8 \uC791\uD488 \uC5C6\uC74C"}),{headers:e});let l=[],p=0,_=new Date().toISOString();for(let u of a){let m=u.media_type?[u.media_type]:["tv","movie"],k=null,E=null,w=!1;for(let y of m)try{let O=await fetch(`https://api.themoviedb.org/3/${y}/${u.tmdb_id}?api_key=${t.TMDB_API_KEY}`);if(!O.ok)continue;let N=await O.json();w=!0,k=N.vote_average??null,E=N.release_date||N.first_air_date||null;break}catch{}w?(l.push(t.DB.prepare("UPDATE works SET tmdb_rating = ?, release_date = ?, rating_updated_at = ? WHERE tmdb_id = ?").bind(k,E,_,u.tmdb_id)),k!==null&&p++):l.push(t.DB.prepare("UPDATE works SET rating_updated_at = ? WHERE tmdb_id = ?").bind(_,u.tmdb_id))}l.length&&await t.DB.batch(l);let f=await t.DB.prepare("SELECT COUNT(*) as cnt FROM works WHERE tmdb_rating IS NULL AND rating_updated_at IS NULL").first();return new Response(JSON.stringify({ok:!0,attempted:a.length,filled:p,remaining:f?.cnt||0}),{headers:e})}catch(s){return new Response(JSON.stringify({ok:!1,message:s.message}),{status:500,headers:e})}}if(d==="/admin/works/batch-imdb-search"&&i.method==="POST"){if(!b(i,t))return new Response(JSON.stringify({ok:!1,message:"Unauthorized"}),{status:401,headers:e});try{let s=30;try{let m=await i.json();m?.limit&&Number.isInteger(m.limit)&&m.limit>0&&(s=m.limit)}catch{}let r=t.OMDB_API_KEY;if(!r)return new Response(JSON.stringify({ok:!1,message:"OMDB key not configured"}),{status:500,headers:e});let l=(await t.DB.prepare("SELECT MAX(date) AS latest_date FROM rankings WHERE date != 'manual'").first())?.latest_date||null,{results:p}=await t.DB.prepare(`
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
      `).bind(l,s).all();if(!p.length)return new Response(JSON.stringify({ok:!0,attempted:0,filled:0,remaining:0,message:"\uB300\uC0C1 \uC791\uD488 \uC5C6\uC74C (\uBAA8\uB450 \uB9E4\uCE6D \uC644\uB8CC\uB410\uAC70\uB098 \uCFE8\uB2E4\uC6B4 \uC911)"}),{headers:e});let _=0,f=new Date().toISOString();for(let m of p)try{if(!m.title_en){await t.DB.prepare("UPDATE works SET imdb_search_attempted_at = ? WHERE tmdb_id = ?").bind(f,m.tmdb_id).run();continue}let k=m.media_type==="movie"?"movie":"series",E=new URLSearchParams({t:m.title_en,type:k,apikey:r});m.release_year&&E.set("y",String(m.release_year));let y=await(await fetch(`https://www.omdbapi.com/?${E.toString()}`)).json();if(y.Response!=="False"&&/^tt\d+$/.test(y.imdbID||"")){let O=parseFloat(y.imdbRating);if(isNaN(O))await t.DB.prepare("UPDATE works SET imdb_id = ?, imdb_search_attempted_at = ? WHERE tmdb_id = ?").bind(y.imdbID,f,m.tmdb_id).run();else{let N=y.imdbVotes||"";await t.DB.prepare("UPDATE works SET imdb_id = ?, imdb_rating = ?, imdb_votes = ?, imdb_updated = ?, imdb_search_attempted_at = ? WHERE tmdb_id = ?").bind(y.imdbID,O,N,f,f,m.tmdb_id).run()}_++}else await t.DB.prepare("UPDATE works SET imdb_search_attempted_at = ? WHERE tmdb_id = ?").bind(f,m.tmdb_id).run()}catch(k){console.error(`[IMDB_BATCH_SEARCH] tmdb_id=${m.tmdb_id} \uC624\uB958:`,k.message)}let u=await t.DB.prepare(`
        SELECT COUNT(*) AS cnt FROM works w
        WHERE (w.imdb_id IS NULL OR w.imdb_id = '')
        AND (
          w.imdb_search_attempted_at IS NULL
          OR w.imdb_search_attempted_at < datetime('now', '-7 days')
        )
      `).first();return console.log(`[IMDB_BATCH_SEARCH] \u2705 \uC644\uB8CC: \uC2DC\uB3C4 ${p.length}\uAC74, \uB9E4\uCE6D ${_}\uAC1C`),new Response(JSON.stringify({ok:!0,attempted:p.length,filled:_,remaining:u?.cnt||0}),{headers:e})}catch(s){return new Response(JSON.stringify({ok:!1,message:s.message}),{status:500,headers:e})}}if(d==="/admin/works/imdb-manual"&&i.method==="POST"){if(!b(i,t))return new Response(JSON.stringify({ok:!1,message:"Unauthorized"}),{status:401,headers:e});try{let s=await i.json(),r=parseInt(s?.tmdb_id);if(!r)return new Response(JSON.stringify({ok:!1,message:"tmdb_id required"}),{status:400,headers:e});let a=s?.imdb_rating===""||s?.imdb_rating==null?null:parseFloat(s.imdb_rating);if(a!==null&&(isNaN(a)||a<0||a>10))return new Response(JSON.stringify({ok:!1,message:"imdb_rating\uC740 0~10 \uC0AC\uC774 \uC22B\uC790\uC5EC\uC57C \uD569\uB2C8\uB2E4"}),{status:400,headers:e});let l=(s?.imdb_votes||"").toString().trim()||null,p=await t.DB.prepare("SELECT imdb_id FROM works WHERE tmdb_id = ?").bind(r).first();return p?(await t.DB.prepare("UPDATE works SET imdb_rating = ?, imdb_votes = ?, imdb_updated = datetime('now') WHERE tmdb_id = ?").bind(a,l,r).run(),new Response(JSON.stringify({ok:!0,warning:p.imdb_id?null:"imdb_id\uAC00 \uC5C6\uB294 \uC791\uD488\uC774\uB77C \uD654\uBA74\uC5D0 \uCE74\uB4DC\uAC00 \uC548 \uB730 \uC218 \uC788\uC2B5\uB2C8\uB2E4 (IMDb \uB9E4\uCE6D \uBC30\uCE58 \uC120\uD589 \uD544\uC694)"}),{headers:e})):new Response(JSON.stringify({ok:!1,message:"\uD574\uB2F9 tmdb_id \uC791\uD488\uC744 \uCC3E\uC744 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4"}),{status:404,headers:e})}catch(s){return new Response(JSON.stringify({ok:!1,message:s.message}),{status:500,headers:e})}}if(d==="/admin/works/missing-media-type"&&i.method==="GET"){if(!b(i,t))return new Response(JSON.stringify({ok:!1,message:"Unauthorized"}),{status:401,headers:e});try{let s=Math.min(parseInt(g.searchParams.get("limit"))||10,30),{results:r}=await t.DB.prepare(`
        SELECT tmdb_id, title_ko, poster_path
        FROM works
        WHERE media_type IS NULL OR media_type = ''
        ORDER BY tmdb_id
        LIMIT ?
      `).bind(s).all(),a=await t.DB.prepare("SELECT COUNT(*) as cnt FROM works WHERE media_type IS NULL OR media_type = ''").first();return new Response(JSON.stringify({ok:!0,items:r,remaining:a?.cnt||0}),{headers:e})}catch(s){return new Response(JSON.stringify({ok:!1,message:s.message}),{status:500,headers:e})}}if(d==="/admin/works/bulk-set-media-type"&&i.method==="POST"){if(!b(i,t))return new Response(JSON.stringify({ok:!1,message:"Unauthorized"}),{status:401,headers:e});try{let s=await i.json().catch(()=>({})),a=(Array.isArray(s.items)?s.items:[]).filter(_=>_&&_.tmdb_id&&(_.media_type==="movie"||_.media_type==="tv"));if(!a.length)return new Response(JSON.stringify({ok:!1,message:"\uC720\uD6A8\uD55C \uD56D\uBAA9\uC774 \uC5C6\uC5B4\uC694 (media_type\uC740 'movie' \uB610\uB294 'tv'\uB9CC \uD5C8\uC6A9)"}),{status:400,headers:e});let l=a.map(_=>t.DB.prepare("UPDATE works SET media_type = ? WHERE tmdb_id = ?").bind(_.media_type,parseInt(_.tmdb_id)));await t.DB.batch(l);let p=await t.DB.prepare("SELECT COUNT(*) as cnt FROM works WHERE media_type IS NULL OR media_type = ''").first();return new Response(JSON.stringify({ok:!0,updated:a.length,remaining:p?.cnt||0}),{headers:e})}catch(s){return new Response(JSON.stringify({ok:!1,message:s.message}),{status:500,headers:e})}}if(d==="/admin/grade-settings"&&i.method==="GET"){if(!b(i,t))return new Response(JSON.stringify({ok:!1,message:"Unauthorized"}),{status:401,headers:e});try{let{results:s}=await t.DB.prepare("SELECT * FROM grade_settings ORDER BY sort_order ASC").all();return new Response(JSON.stringify({ok:!0,data:s}),{headers:e})}catch(s){return new Response(JSON.stringify({ok:!1,message:s.message}),{status:500,headers:e})}}if(d==="/admin/grade-settings"&&i.method==="PUT"){if(!b(i,t))return new Response(JSON.stringify({ok:!1,message:"Unauthorized"}),{status:401,headers:e});try{let s=await i.json();if(!Array.isArray(s))return new Response(JSON.stringify({ok:!1,message:"Array required"}),{status:400,headers:e});for(let r of s)await t.DB.prepare(`
          INSERT INTO grade_settings
            (grade_key, grade_name, emoji_url, min_ott_points, is_special, sort_order)
          VALUES (?, ?, ?, ?, ?, ?)
          ON CONFLICT(grade_key) DO UPDATE SET
            grade_name     = excluded.grade_name,
            emoji_url      = excluded.emoji_url,
            min_ott_points = excluded.min_ott_points,
            is_special     = excluded.is_special,
            sort_order     = excluded.sort_order
        `).bind(r.grade_key,r.grade_name,r.emoji_url||"",r.min_ott_points||0,r.is_special?1:0,r.sort_order||0).run();return new Response(JSON.stringify({ok:!0}),{headers:e})}catch(s){return new Response(JSON.stringify({ok:!1,message:s.message}),{status:500,headers:e})}}if(d==="/admin/grade-settings/assign"&&i.method==="POST"){if(!b(i,t))return new Response(JSON.stringify({ok:!1,message:"Unauthorized"}),{status:401,headers:e});try{let{user_id:s,grade_key:r}=await i.json();return!s||!r?new Response(JSON.stringify({ok:!1,message:"user_id, grade_key required"}),{status:400,headers:e}):(await t.DB.prepare("UPDATE users SET grade = ? WHERE id = ?").bind(r,s).run(),new Response(JSON.stringify({ok:!0}),{headers:e}))}catch(s){return new Response(JSON.stringify({ok:!1,message:s.message}),{status:500,headers:e})}}if(d==="/admin/users"&&i.method==="GET"){if(!b(i,t))return new Response(JSON.stringify({ok:!1,message:"Unauthorized"}),{status:401,headers:e});try{let s=parseInt(g.searchParams.get("page")||"1"),r=50,a=(s-1)*r,l=g.searchParams.get("q")||"",p=`
        SELECT u.id, u.nickname, u.provider, u.grade, u.total_likes_received,
          u.created_at, u.last_login, u.ott_points,
          gs.grade_name, gs.emoji_url as grade_emoji_url,
          (SELECT COUNT(*) FROM reviews  WHERE user_id = u.id) as review_count,
          (SELECT COUNT(*) FROM wishlist WHERE user_id = u.id) as wishlist_count,
          (SELECT COUNT(*) FROM posts    WHERE user_id = u.id) as post_count
        FROM users u
        LEFT JOIN grade_settings gs ON gs.grade_key = u.grade
      `,_=[];l&&(p+=" WHERE u.nickname LIKE ?",_.push(`%${l}%`)),p+=" ORDER BY u.created_at DESC LIMIT ? OFFSET ?",_.push(r,a);let{results:f}=await t.DB.prepare(p).bind(..._).all();return new Response(JSON.stringify({ok:!0,data:f}),{headers:e})}catch(s){return new Response(JSON.stringify({ok:!1,message:s.message}),{status:500,headers:e})}}if(d==="/admin/ott-points/adjust"&&i.method==="POST"){if(!b(i,t))return new Response(JSON.stringify({ok:!1,message:"Unauthorized"}),{status:401,headers:e});try{let{user_id:s,points:r,reason:a}=await i.json();if(!s||r===void 0||!a)return new Response(JSON.stringify({ok:!1,message:"user_id, points, reason \uD544\uC218"}),{status:400,headers:e});await t.DB.prepare("INSERT INTO user_point_logs (user_id, points, reason) VALUES (?, ?, ?)").bind(s,r,a).run(),await t.DB.prepare("UPDATE users SET ott_points = MAX(0, COALESCE(ott_points, 0) + ?) WHERE id = ?").bind(r,s).run();let l=await t.DB.prepare("SELECT ott_points FROM users WHERE id = ?").bind(s).first();if(l){let p=await bt(l.ott_points,t);p&&await t.DB.prepare("UPDATE users SET grade = ? WHERE id = ? AND (grade IS NULL OR grade NOT IN (SELECT grade_key FROM grade_settings WHERE is_special = 1))").bind(p,s).run()}return new Response(JSON.stringify({ok:!0}),{headers:e})}catch(s){return new Response(JSON.stringify({ok:!1,message:s.message}),{status:500,headers:e})}}return null}async function bt(d,i){try{let{results:t}=await i.DB.prepare(`SELECT grade_key FROM grade_settings
       WHERE is_special = 0 AND min_ott_points <= ?
       ORDER BY min_ott_points DESC LIMIT 1`).bind(d).all();return t[0]?.grade_key||null}catch{return null}}async function it(d,i,t,g,e){let o=i.method;try{if(o==="GET"&&d==="/contents")return Nt(g,t,e);if(o==="GET"&&d==="/contents/pinned")return Tt(t,e);if(o==="GET"&&d==="/contents/list")return Dt(g,t,e);let n=d.match(/^\/contents\/video\/(\d+)$/);if(o==="GET"&&n)return ht(n[1],t,e);let c=d.match(/^\/contents\/comments\/(\d+)$/);if(o==="GET"&&c)return At(c[1],t,e);if(o==="POST"&&d==="/contents/comments")return Lt(i,t,e);let s=d.match(/^\/contents\/comments\/(\d+)$/);if(o==="DELETE"&&s)return It(s[1],i,t,e);if(o==="PATCH"&&d==="/admin/contents/pinned/reorder")return Ft(i,t,e);if(o==="GET"&&d==="/admin/contents/check")return Bt(g,i,t,e);if(o==="GET"&&d==="/admin/contents")return Ct(g,i,t,e);if(o==="POST"&&d==="/admin/contents")return Jt(i,t,e);let r=d.match(/^\/admin\/contents\/(\d+)$/);if(o==="PUT"&&r)return Mt(r[1],i,t,e);let a=d.match(/^\/admin\/contents\/(\d+)$/);return o==="DELETE"&&a?Ht(a[1],i,t,e):null}catch(n){return console.error("[contents] \uC624\uB958:",n),new Response(JSON.stringify({ok:!1,error:"\uC11C\uBC84 \uC624\uB958\uAC00 \uBC1C\uC0DD\uD588\uC2B5\uB2C8\uB2E4."}),{status:500,headers:e})}}function A(d,i=200,t={}){return new Response(JSON.stringify(d),{status:i,headers:{"Content-Type":"application/json",...t}})}function U(d,i){return(d.headers.get("Authorization")||"").replace("Bearer ","").trim()===i.ADMIN_SECRET}async function rt(d,i,t,g,e){if(!d||!t)return;let o=await e.DB.prepare("SELECT media_type FROM works WHERE tmdb_id = ?").bind(d).first();if(!o){console.log(`[CONTENTS_LINK] tmdb_id=${d} works\uC5D0 \uC5C6\uC74C \u2014 title_videos \uBCF5\uC0AC \uC2A4\uD0B5`);return}if(!i||o.media_type!==i){console.log(`[CONTENTS_LINK] tmdb_id=${d} \uD0C0\uC785 \uBD88\uC77C\uCE58(works=${o.media_type}, ott_contents=${i}) \u2014 title_videos \uBCF5\uC0AC \uC2A4\uD0B5`);return}await e.DB.prepare(`
    INSERT OR IGNORE INTO title_videos (tmdb_id, youtube_url, youtube_id, title, is_main)
    VALUES (?, ?, ?, ?, 0)
  `).bind(d,`https://www.youtube.com/watch?v=${t}`,t,g||"").run(),console.log(`[CONTENTS_LINK] \u2705 tmdb_id=${d} youtube_id=${t} title_videos \uBCF5\uC0AC \uC644\uB8CC`)}async function Nt(d,i,t){let g=d.searchParams.get("platform"),e=d.searchParams.get("type"),o=Math.min(parseInt(d.searchParams.get("limit")||"20"),50),n=["is_hidden = 0"],c=[];g&&(n.push("platform = ?"),c.push(g)),e&&(n.push("type = ?"),c.push(e));let s=n.join(" AND ");c.push(o);let{results:r}=await i.DB.prepare(`SELECT id, youtube_id, platform, type, title, work_title,
            tmdb_id, tmdb_type, thumbnail, published_at, view_count, is_pinned
     FROM ott_contents
     WHERE ${s}
     ORDER BY published_at DESC
     LIMIT ?`).bind(...c).all();return A({ok:!0,items:r??[]},200,t)}async function Tt(d,i){let{results:t}=await d.DB.prepare(`SELECT id, youtube_id, platform, type, title, work_title,
            tmdb_id, tmdb_type, thumbnail, published_at, view_count,
            is_pinned, sort_order
     FROM ott_contents
     WHERE is_pinned = 1 AND is_hidden = 0
     ORDER BY sort_order ASC
     LIMIT 5`).all();return A({ok:!0,items:t??[]},200,i)}async function Dt(d,i,t){let g=d.searchParams.get("platform"),e=d.searchParams.get("type"),o=Math.max(parseInt(d.searchParams.get("page")||"1"),1),n=30,c=(o-1)*n,s=["is_hidden = 0"],r=[];g&&(s.push("platform = ?"),r.push(g)),e&&(s.push("type = ?"),r.push(e));let a=s.join(" AND "),l=[...r],p=[...r,n,c],[_,f]=await i.DB.batch([i.DB.prepare(`SELECT COUNT(*) as total FROM ott_contents WHERE ${a}`).bind(...l),i.DB.prepare(`SELECT id, youtube_id, platform, type, title, work_title,
              tmdb_id, tmdb_type, thumbnail, published_at, view_count
       FROM ott_contents
       WHERE ${a}
       ORDER BY published_at DESC
       LIMIT ? OFFSET ?`).bind(...p)]),u=_.results?.[0]?.total??0,m=f.results??[];return A({ok:!0,items:m,pagination:{page:o,pageSize:n,total:u,totalPages:Math.ceil(u/n)}},200,t)}async function ht(d,i,t){let g=await i.DB.prepare(`SELECT id, youtube_id, platform, type, title, work_title,
            tmdb_id, tmdb_type, thumbnail, published_at, view_count,
            is_pinned, created_at
     FROM ott_contents
     WHERE id = ? AND is_hidden = 0`).bind(d).first();return g?(i.DB.prepare("UPDATE ott_contents SET view_count = view_count + 1 WHERE id = ?").bind(d).run(),A({ok:!0,item:g},200,t)):A({ok:!1,error:"\uC601\uC0C1\uC744 \uCC3E\uC744 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4."},404,t)}async function At(d,i,t){let{results:g}=await i.DB.prepare(`SELECT c.id, c.body, c.created_at,
            u.id AS user_id,
            u.nickname,
            u.profile_image
     FROM ott_content_comments c
     JOIN users u ON c.user_id = u.id
     WHERE c.content_id = ? AND c.is_hidden = 0
     ORDER BY c.created_at ASC`).bind(d).all();return A({ok:!0,comments:g??[]},200,t)}async function Lt(d,i,t){let g=d.headers.get("Authorization")||"",e=g.startsWith("Bearer ")?g.slice(7).trim():null,o=h(d),n=e||o;if(!n)return A({ok:!1,error:"\uB85C\uADF8\uC778\uC774 \uD544\uC694\uD569\uB2C8\uB2E4."},401,t);let c=await i.DB.prepare(`SELECT s.user_id AS id, u.nickname
     FROM sessions s
     JOIN users u ON u.id = s.user_id
     WHERE s.id = ?
     LIMIT 1`).bind(n).first();if(!c)return A({ok:!1,error:"\uB85C\uADF8\uC778\uC774 \uD544\uC694\uD569\uB2C8\uB2E4."},401,t);let s;try{s=await d.json()}catch{return A({ok:!1,error:"\uC798\uBABB\uB41C \uC694\uCCAD \uD615\uC2DD\uC785\uB2C8\uB2E4."},400,t)}let{content_id:r,body:a}=s;if(!r||!a?.trim())return A({ok:!1,error:"content_id\uC640 \uB313\uAE00 \uB0B4\uC6A9\uC774 \uD544\uC694\uD569\uB2C8\uB2E4."},400,t);if(a.trim().length>500)return A({ok:!1,error:"\uB313\uAE00\uC740 500\uC790 \uC774\uB0B4\uB85C \uC785\uB825\uD574\uC8FC\uC138\uC694."},400,t);if(!await i.DB.prepare("SELECT id FROM ott_contents WHERE id = ? AND is_hidden = 0").bind(r).first())return A({ok:!1,error:"\uC601\uC0C1\uC744 \uCC3E\uC744 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4."},404,t);let p=await i.DB.prepare(`INSERT INTO ott_content_comments (content_id, user_id, body)
     VALUES (?, ?, ?)`).bind(r,c.id,a.trim()).run();return A({ok:!0,id:p.meta?.last_row_id},200,t)}async function It(d,i,t,g){let e=i.headers.get("Authorization")||"",o=e.startsWith("Bearer ")?e.slice(7).trim():null,n=h(i),c=o||n;if(!c)return A({ok:!1,error:"\uB85C\uADF8\uC778\uC774 \uD544\uC694\uD569\uB2C8\uB2E4."},401,g);let s=await t.DB.prepare("SELECT s.user_id AS id FROM sessions s WHERE s.id = ? LIMIT 1").bind(c).first();if(!s)return A({ok:!1,error:"\uB85C\uADF8\uC778\uC774 \uD544\uC694\uD569\uB2C8\uB2E4."},401,g);let r=await t.DB.prepare("SELECT id, user_id FROM ott_content_comments WHERE id = ?").bind(d).first();return r?r.user_id!==s.id?A({ok:!1,error:"\uBCF8\uC778 \uB313\uAE00\uB9CC \uC0AD\uC81C\uD560 \uC218 \uC788\uC2B5\uB2C8\uB2E4."},403,g):(await t.DB.prepare("DELETE FROM ott_content_comments WHERE id = ?").bind(d).run(),A({ok:!0},200,g)):A({ok:!1,error:"\uB313\uAE00\uC744 \uCC3E\uC744 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4."},404,g)}async function Ct(d,i,t,g){if(!U(i,t))return A({ok:!1,error:"\uAD8C\uD55C\uC774 \uC5C6\uC2B5\uB2C8\uB2E4."},403,g);let e=d.searchParams.get("platform"),o=d.searchParams.get("type"),n=(d.searchParams.get("q")||"").trim(),c=Math.max(parseInt(d.searchParams.get("page")||"1"),1),s=50,r=(c-1)*s,a=["1=1"],l=[];if(e&&(a.push("platform = ?"),l.push(e)),o&&(a.push("type = ?"),l.push(o)),n){let w=n.replace(/\s+/g,"");a.push("(REPLACE(work_title, ' ', '') LIKE ? OR REPLACE(title, ' ', '') LIKE ?)"),l.push(`%${w}%`,`%${w}%`)}let p=a.join(" AND "),_=[...l],f=[...l,s,r],[u,m]=await t.DB.batch([t.DB.prepare(`SELECT COUNT(*) as total FROM ott_contents WHERE ${p}`).bind(..._),t.DB.prepare(`SELECT id, youtube_id, platform, type, title, work_title,
              tmdb_id, tmdb_type, thumbnail, published_at,
              view_count, is_pinned, is_hidden, sort_order, created_at
       FROM ott_contents
       WHERE ${p}
       ORDER BY published_at DESC
       LIMIT ? OFFSET ?`).bind(...f)]),k=u.results?.[0]?.total??0,E=m.results??[];return A({ok:!0,items:E,pagination:{page:c,pageSize:s,total:k,totalPages:Math.ceil(k/s)}},200,g)}async function Bt(d,i,t,g){if(!U(i,t))return A({ok:!1,error:"\uAD8C\uD55C\uC774 \uC5C6\uC2B5\uB2C8\uB2E4."},403,g);let e=d.searchParams.get("youtube_id");if(!e)return A({ok:!1,error:"youtube_id\uAC00 \uD544\uC694\uD569\uB2C8\uB2E4."},400,g);let o=await t.DB.prepare("SELECT id FROM ott_contents WHERE youtube_id = ?").bind(e).first();return A({ok:!0,exists:!!o},200,g)}async function Jt(d,i,t){if(!U(d,i))return A({ok:!1,error:"\uAD8C\uD55C\uC774 \uC5C6\uC2B5\uB2C8\uB2E4."},403,t);let g;try{g=await d.json()}catch{return A({ok:!1,error:"\uC798\uBABB\uB41C \uC694\uCCAD \uD615\uC2DD\uC785\uB2C8\uB2E4."},400,t)}let{youtube_id:e,platform:o,type:n="trailer",title:c,work_title:s,tmdb_id:r,tmdb_type:a,thumbnail:l,published_at:p}=g;if(!e||!o||!c||!p)return A({ok:!1,error:"youtube_id, platform, title, published_at\uB294 \uD544\uC218\uC785\uB2C8\uB2E4."},400,t);if(!["netflix","tving","disney","coupang","wavve","boxoffice","etc"].includes(o))return A({ok:!1,error:"\uC720\uD6A8\uD558\uC9C0 \uC54A\uC740 \uD50C\uB7AB\uD3FC\uC785\uB2C8\uB2E4."},400,t);if(!["trailer","teaser","preview","release"].includes(n))return A({ok:!1,error:"\uC720\uD6A8\uD558\uC9C0 \uC54A\uC740 \uD0C0\uC785\uC785\uB2C8\uB2E4."},400,t);try{let u=await i.DB.prepare(`INSERT INTO ott_contents
         (youtube_id, platform, type, title, work_title,
          tmdb_id, tmdb_type, thumbnail, published_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`).bind(e,o,n,c,s||null,r||null,a||null,l||null,p).run();if(r&&s)try{await i.DB.prepare(`INSERT OR IGNORE INTO works (tmdb_id, media_type, title_ko, match_source)
           VALUES (?, ?, ?, 'crawler')`).bind(r,a||null,s).run()}catch(m){console.error("[contents] works \uC790\uB3D9\uB4F1\uB85D \uC2E4\uD328(\uBB34\uC2DC):",m.message)}if(r)try{await rt(r,a||null,e,c,i)}catch(m){console.error("[contents] title_videos \uBCF5\uC0AC \uC2E4\uD328(\uBB34\uC2DC):",m.message)}return A({ok:!0,id:u.meta?.last_row_id},200,t)}catch(u){if(u.message?.includes("UNIQUE"))return A({ok:!1,error:"\uC774\uBBF8 \uB4F1\uB85D\uB41C YouTube \uC601\uC0C1\uC785\uB2C8\uB2E4."},409,t);throw u}}async function Mt(d,i,t,g){if(!U(i,t))return A({ok:!1,error:"\uAD8C\uD55C\uC774 \uC5C6\uC2B5\uB2C8\uB2E4."},403,g);let e;try{e=await i.json()}catch{return A({ok:!1,error:"\uC798\uBABB\uB41C \uC694\uCCAD \uD615\uC2DD\uC785\uB2C8\uB2E4."},400,g)}let o=await t.DB.prepare("SELECT id, youtube_id, title, tmdb_type FROM ott_contents WHERE id = ?").bind(d).first();if(!o)return A({ok:!1,error:"\uC601\uC0C1\uC744 \uCC3E\uC744 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4."},404,g);let n=["work_title","tmdb_id","tmdb_type","type","is_pinned","is_hidden","sort_order"],c=[],s=[];for(let r of n)e[r]!==void 0&&(c.push(`${r} = ?`),s.push(e[r]));if(c.length===0)return A({ok:!1,error:"\uC218\uC815\uD560 \uAC12\uC774 \uC5C6\uC2B5\uB2C8\uB2E4."},400,g);if(s.push(d),await t.DB.prepare(`UPDATE ott_contents SET ${c.join(", ")} WHERE id = ?`).bind(...s).run(),e.tmdb_id!==void 0)try{let r=e.tmdb_type!==void 0?e.tmdb_type:o.tmdb_type;await rt(e.tmdb_id,r,o.youtube_id,o.title,t)}catch(r){console.error("[contents] title_videos \uBCF5\uC0AC \uC2E4\uD328(\uBB34\uC2DC):",r.message)}return A({ok:!0},200,g)}async function Ht(d,i,t,g){return U(i,t)?await t.DB.prepare("SELECT id FROM ott_contents WHERE id = ?").bind(d).first()?(await t.DB.prepare("DELETE FROM ott_contents WHERE id = ?").bind(d).run(),A({ok:!0},200,g)):A({ok:!1,error:"\uC601\uC0C1\uC744 \uCC3E\uC744 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4."},404,g):A({ok:!1,error:"\uAD8C\uD55C\uC774 \uC5C6\uC2B5\uB2C8\uB2E4."},403,g)}async function Ft(d,i,t){if(!U(d,i))return A({ok:!1,error:"\uAD8C\uD55C\uC774 \uC5C6\uC2B5\uB2C8\uB2E4."},403,t);let g;try{g=await d.json()}catch{return A({ok:!1,error:"\uC798\uBABB\uB41C \uC694\uCCAD \uD615\uC2DD\uC785\uB2C8\uB2E4."},400,t)}let{ordered_ids:e}=g;if(!Array.isArray(e)||e.length===0)return A({ok:!1,error:"ordered_ids \uBC30\uC5F4\uC774 \uD544\uC694\uD569\uB2C8\uB2E4."},400,t);if(e.length>5)return A({ok:!1,error:"\uACE0\uC815 \uC601\uC0C1\uC740 \uCD5C\uB300 5\uAC1C\uC785\uB2C8\uB2E4."},400,t);let o=[i.DB.prepare("UPDATE ott_contents SET is_pinned = 0, sort_order = 0"),...e.map((n,c)=>i.DB.prepare("UPDATE ott_contents SET is_pinned = 1, sort_order = ? WHERE id = ?").bind(c+1,n))];return await i.DB.batch(o),A({ok:!0},200,t)}var ct="https://api.anthropic.com/v1/messages",at="https://ottrank.kr",P={netflix:"\uB137\uD50C\uB9AD\uC2A4",tving:"\uD2F0\uBE59",wavve:"\uC6E8\uC774\uBE0C",disney:"\uB514\uC988\uB2C8+",coupang:"\uCFE0\uD321\uD50C\uB808\uC774",boxoffice:"\uBC15\uC2A4\uC624\uD53C\uC2A4"},nt={friendly:`\uB124\uC774\uBC84 \uBE14\uB85C\uADF8 \uAC10\uC131 \uB9D0\uD22C. \uC9E7\uC740 \uC904\uBC14\uAFC8, \uBCF8\uC778 \uC598\uAE30\uB85C \uC2DC\uC791, \uB3C5\uC790\uC5D0\uAC8C \uB9D0 \uAC70\uB294 \uB290\uB08C.
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
2. \uB2E8\uC21C \uC21C\uC704 \uB098\uC5F4\uD615(TOP N) \uC81C\uBAA9\uC740 \uC9C0\uC591\uD558\uACE0 \uD654\uC81C\uC131\uC5D0 \uC9D1\uC911`}};async function z(d,i,t=null){let g=t?`SELECT category_slot, display_name, platform_limit, source_name
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
       ORDER BY platform_order ASC`,e=t?await i.DB.prepare(g).bind(d,t).all():await i.DB.prepare(g).bind(d).all();if(!e.results||e.results.length===0)return[];let o=[];for(let n of e.results){let c=n.platform_limit||10,s=await i.DB.prepare(`SELECT
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
       LIMIT ?`).bind(d,n.category_slot,d,n.category_slot,c).all();s.results&&s.results.length>0&&o.push({category_slot:n.category_slot,display_name:n.display_name,source_name:n.source_name||"",items:s.results})}return o}function Wt(d,i){let g=`[${P[i]||i} \uD604\uC7AC \uB7AD\uD0B9 \uB370\uC774\uD130]

`;return d.forEach(e=>{!e.items||e.items.length===0||(g+=`## ${e.display_name}
`,e.items.forEach((o,n)=>{let c=o.title_ko||o.title_en||"\uC81C\uBAA9 \uC5C6\uC74C",s=o.tmdb_rating?` (\uC624\uB728\uB791 \uD3C9\uC810: ${o.tmdb_rating})`:"",r=o.release_year?` [${o.release_year}\uB144]`:"",a=o.genre?` | \uC7A5\uB974: ${o.genre}`:"";g+=`${n+1}\uC704. ${c}${r}${s}${a}
`}),g+=`
`)}),g}function lt(){let d=new Date,i=d.getFullYear(),t=d.getMonth()+1,g=Math.ceil(d.getDate()/7);return`${i}\uB144 ${t}\uC6D4 ${g}\uC8FC\uCC28`}async function Ut(d,i,{useWebSearch:t=!0,maxTokens:g=4096}={}){let e={model:"claude-sonnet-4-6",max_tokens:g,messages:[{role:"user",content:d}]};t&&(e.tools=[{type:"web_search_20250305",name:"web_search",max_uses:5}]);let o=await fetch(ct,{method:"POST",headers:{"Content-Type":"application/json","x-api-key":i,"anthropic-version":"2023-06-01"},body:JSON.stringify(e)});if(!o.ok){let c=await o.json().catch(()=>({}));throw new Error(c.error?.message||`Anthropic API \uC624\uB958: ${o.status}`)}return((await o.json()).content||[]).filter(c=>c.type==="text").map(c=>c.text).join(`
`)}async function _t(d,i,t,g,e){if(i.method==="GET"&&d==="/blog-gen/image"){let o=g.searchParams.get("path")||"",n=g.searchParams.get("size")||"w780";if(!o)return new Response(JSON.stringify({ok:!1,error:"path \uD30C\uB77C\uBBF8\uD130 \uD544\uC694"}),{status:400,headers:e});try{let c=`https://image.tmdb.org/t/p/${n}${o}`,s=await fetch(c);if(!s.ok)throw new Error(`\uC774\uBBF8\uC9C0 \uB85C\uB4DC \uC2E4\uD328: ${s.status}`);let r=await s.arrayBuffer(),a=s.headers.get("content-type")||"image/jpeg";return new Response(r,{status:200,headers:{"Content-Type":a,"Access-Control-Allow-Origin":e["Access-Control-Allow-Origin"],"Cache-Control":"public, max-age=86400"}})}catch(c){return new Response(JSON.stringify({ok:!1,error:c.message}),{status:500,headers:e})}}if(i.method==="GET"&&d==="/blog-gen/preview"){if(!b(i,t))return new Response(JSON.stringify({ok:!1,error:"Unauthorized"}),{status:401,headers:e});let o=g.searchParams.get("platform")||"netflix",n=g.searchParams.get("categorySlot")||null;if(!P[o])return new Response(JSON.stringify({ok:!1,error:"\uC9C0\uC6D0\uD558\uC9C0 \uC54A\uB294 \uD50C\uB7AB\uD3FC\uC785\uB2C8\uB2E4."}),{status:400,headers:e});try{let c=await z(o,t,n);return new Response(JSON.stringify({ok:!0,data:c}),{headers:e})}catch(c){return new Response(JSON.stringify({ok:!1,error:c.message}),{status:500,headers:e})}}if(i.method==="POST"&&d==="/blog-gen/suggest"){if(!b(i,t))return new Response(JSON.stringify({ok:!1,error:"Unauthorized"}),{status:401,headers:e});let o=t.ANTHROPIC_API_KEY;if(!o)return new Response(JSON.stringify({ok:!1,error:"ANTHROPIC_API_KEY \uD658\uACBD \uBCC0\uC218\uAC00 \uC124\uC815\uB418\uC9C0 \uC54A\uC558\uC2B5\uB2C8\uB2E4."}),{status:500,headers:e});let n;try{n=await i.json()}catch{return new Response(JSON.stringify({ok:!1,error:"\uC798\uBABB\uB41C \uC694\uCCAD \uD615\uC2DD\uC785\uB2C8\uB2E4."}),{status:400,headers:e})}let{platform:c="netflix",topicType:s="ranking",categorySlot:r="all"}=n;try{let a=[],l=c==="all"?["netflix","tving"]:[c],p=c!=="all"&&r&&r!=="all"?r:null;for(let T of l){if(T!=="all"&&!P[T])continue;let L=await z(T,t,p);a.push(...L)}let _="";a.length>0?_=a.map(T=>`[${T.display_name}]
`+(T.items||[]).slice(0,5).map((L,C)=>{let I=L.title_ko||L.title_en||"\uC81C\uBAA9 \uC5C6\uC74C",B=L.genre?` (${L.genre.split(",")[0]})`:"",J=L.tmdb_rating?` \u2605${parseFloat(L.tmdb_rating).toFixed(1)}`:"";return`  ${C+1}\uC704. ${I}${B}${J}`}).join(`
`)).join(`

`):_="\uD604\uC7AC \uB7AD\uD0B9 \uB370\uC774\uD130 \uC5C6\uC74C. OTT \uC778\uAE30 \uCF58\uD150\uCE20 \uC77C\uBC18 \uD2B8\uB80C\uB4DC \uAE30\uBC18\uC73C\uB85C \uCD94\uCC9C\uD574\uC8FC\uC138\uC694.";let f=c==="all"?"\uB137\uD50C\uB9AD\uC2A4\xB7\uD2F0\uBE59":P[c]||c,u=lt(),m=(()=>{if(a.length===1){let T=a[0].display_name||"";if(T.includes("\uC601\uD654"))return"\uC601\uD654";if(T.includes("\uB4DC\uB77C\uB9C8")||T.includes("TV")||T.includes("\uC2DC\uB9AC\uC988"))return"\uB4DC\uB77C\uB9C8"}return"\uB4DC\uB77C\uB9C8\xB7\uC601\uD654"})(),k=dt[s]||dt.ranking,E=k.examples.map(T=>"- "+T.replace(/{platform}/g,f).replace(/{media}/g,m).replace(/{week}/g,u)).join(`
`),w=k.rule.replace(/{platform}/g,f).replace(/{week}/g,u),y=`\uB2F9\uC2E0\uC740 \uB124\uC774\uBC84 \uBE14\uB85C\uADF8 SEO \uC804\uBB38\uAC00\uC785\uB2C8\uB2E4.
\uC544\uB798\uB294 \uB124\uC774\uBC84\uC5D0\uC11C \uC2E4\uC81C\uB85C \uC0C1\uC704 \uB178\uCD9C\uB418\uB294 OTT \uBE14\uB85C\uADF8 \uC81C\uBAA9 \uD328\uD134 \uC911 "${k.label}" \uC720\uD615 \uC608\uC2DC\uC785\uB2C8\uB2E4.
\uC774\uBC88 \uCD94\uCC9C\uC740 \uBC18\uB4DC\uC2DC "${k.label}" \uC2A4\uD0C0\uC77C\uB85C\uB9CC \uC791\uC131\uD558\uACE0, \uB2E4\uB978 \uC720\uD615\uACFC \uC11E\uC9C0 \uB9C8\uC138\uC694.

[${k.label} \uD328\uD134 \uC608\uC2DC]
${E}

\uD604\uC7AC \uB7AD\uD0B9 \uB370\uC774\uD130:
\uD50C\uB7AB\uD3FC: ${f} / \uAE30\uAC04: ${u}

${_}

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
]`,O=await fetch(ct,{method:"POST",headers:{"Content-Type":"application/json","x-api-key":o,"anthropic-version":"2023-06-01"},body:JSON.stringify({model:"claude-haiku-4-5-20251001",max_tokens:1500,messages:[{role:"user",content:y}],tools:[{type:"web_search_20250305",name:"web_search",max_uses:3}]})});if(!O.ok){let T=await O.json().catch(()=>({}));throw new Error(T.error?.message||`Anthropic API \uC624\uB958: ${O.status}`)}let D=(((await O.json()).content||[]).filter(T=>T.type==="text").map(T=>T.text).join("").trim()||"[]").replace(/^```json\s*/i,"").replace(/^```\s*/,"").replace(/\s*```$/,"").trim(),S;try{S=JSON.parse(D)}catch{let T=D.match(/\[[\s\S]*\]/);if(T)try{S=JSON.parse(T[0])}catch{}}if(!S)throw new Error("AI \uC751\uB2F5\uC744 JSON\uC73C\uB85C \uD30C\uC2F1\uD560 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4. \uB2E4\uC2DC \uC2DC\uB3C4\uD574\uC8FC\uC138\uC694.");if(!Array.isArray(S))throw new Error("AI \uC751\uB2F5\uC774 \uBC30\uC5F4 \uD615\uC2DD\uC774 \uC544\uB2D9\uB2C8\uB2E4.");return S=S.filter(T=>T&&typeof T.title=="string"&&T.title.trim()).map(T=>({title:T.title.trim(),topic:T.topic?.trim()||"",contentType:T.contentType?.trim()||"weekly_ranking"})).slice(0,8),new Response(JSON.stringify({ok:!0,suggestions:S,rankingData:a,meta:{platform:f,weekLabel:u,topicType:s,categorySlot:p||"all",categoryLabel:p&&a.length===1?a[0].display_name:"\uC804\uCCB4",generatedAt:new Date().toISOString()}}),{headers:e})}catch(a){return new Response(JSON.stringify({ok:!1,error:a.message}),{status:500,headers:e})}}if(i.method==="POST"&&d==="/blog-gen"){if(!b(i,t))return new Response(JSON.stringify({ok:!1,error:"Unauthorized"}),{status:401,headers:e});let o=t.ANTHROPIC_API_KEY;if(!o)return new Response(JSON.stringify({ok:!1,error:"ANTHROPIC_API_KEY \uD658\uACBD \uBCC0\uC218\uAC00 \uC124\uC815\uB418\uC9C0 \uC54A\uC558\uC2B5\uB2C8\uB2E4. Cloudflare Workers \u2192 Settings \u2192 Variables and Secrets\uC5D0\uC11C \uB4F1\uB85D\uD574\uC8FC\uC138\uC694."}),{status:500,headers:e});let n;try{n=await i.json()}catch{return new Response(JSON.stringify({ok:!1,error:"\uC798\uBABB\uB41C \uC694\uCCAD \uD615\uC2DD\uC785\uB2C8\uB2E4."}),{status:400,headers:e})}let{platform:c="netflix",contentType:s="weekly_ranking",categorySlot:r="all",tone:a="friendly",useEmoji:l=!0,useRating:p=!0,useLink:_=!0,useSpoiler:f=!1,useHashtag:u=!0,extraRequest:m=""}=n;if(!P[c])return new Response(JSON.stringify({ok:!1,error:"\uC9C0\uC6D0\uD558\uC9C0 \uC54A\uB294 \uD50C\uB7AB\uD3FC\uC785\uB2C8\uB2E4."}),{status:400,headers:e});let k=r&&r!=="all"?r:null;try{let E=await z(c,t,k);if(E.length===0)return new Response(JSON.stringify({ok:!1,error:k?"\uC120\uD0DD\uD55C \uCE74\uD14C\uACE0\uB9AC\uC758 \uB7AD\uD0B9 \uB370\uC774\uD130\uAC00 \uC5C6\uC2B5\uB2C8\uB2E4. \uB2E4\uB978 \uCE74\uD14C\uACE0\uB9AC\uB97C \uC120\uD0DD\uD558\uAC70\uB098 '\uC804\uCCB4'\uB85C \uB2E4\uC2DC \uC2DC\uB3C4\uD574\uC8FC\uC138\uC694.":"\uB7AD\uD0B9 \uB370\uC774\uD130\uAC00 \uC5C6\uC2B5\uB2C8\uB2E4. \uD06C\uB864\uB9C1 \uC644\uB8CC \uD6C4 \uB2E4\uC2DC \uC2DC\uB3C4\uD558\uAC70\uB098, \uD398\uC774\uC9C0 \uCE74\uD14C\uACE0\uB9AC \uC124\uC815\uC5D0\uC11C OTT \uD398\uC774\uC9C0 \uB178\uCD9C \uC5EC\uBD80\uB97C \uD655\uC778\uD574\uC8FC\uC138\uC694."}),{status:404,headers:e});let w=Wt(E,c),y=lt(),O=P[c],N=E.length===1&&(E[0].display_name||"").includes("\uC601\uD654")?"\uC601\uD654":"\uB4DC\uB77C\uB9C8",R=!!(m&&m.trim()),D=R?m.trim():`${y} ${O} \u2014 ${ot[s]||ot.weekly_ranking}`,S=[];l||S.push("\uC774\uBAA8\uC9C0\uB97C \uC0AC\uC6A9\uD558\uC9C0 \uB9C8\uC138\uC694."),p&&S.push(`\uC624\uB728\uB791(${at}) \uD3C9\uC810 \uC815\uBCF4\uB97C \uC790\uC5F0\uC2A4\uB7FD\uAC8C \uC5B8\uAE09\uD574\uC8FC\uC138\uC694.`),_&&S.push(`\uD3EC\uC2A4\uD305 \uC911\uAC04\uC774\uB098 \uB9C8\uC9C0\uB9C9\uC5D0 "${at}" \uB9C1\uD06C\uB97C "\uC624\uB728\uB791\uC5D0\uC11C \uB354 \uBCF4\uAE30" \uD615\uD0DC\uB85C \uC790\uC5F0\uC2A4\uB7FD\uAC8C \uC0BD\uC785\uD574\uC8FC\uC138\uC694.`),f&&S.push("\uC2A4\uD3EC\uC77C\uB7EC \uC8FC\uC758 \uBB38\uAD6C\uAC00 \uD544\uC694\uD55C \uC791\uD488\uC5D0\uB294 \u26A0\uFE0F \uC2A4\uD3EC\uC8FC\uC758 \uB77C\uBCA8\uC744 \uB2EC\uC544\uC8FC\uC138\uC694."),u&&S.push(`\uD3EC\uC2A4\uD305 \uB9C8\uC9C0\uB9C9\uC5D0 \uB124\uC774\uBC84 \uBE14\uB85C\uADF8\uC6A9 \uD574\uC2DC\uD0DC\uADF8\uB97C 15\uAC1C \uC774\uC0C1 \uCD94\uAC00\uD574\uC8FC\uC138\uC694. (\uC608: #${O}${N}\uCD94\uCC9C #OTT\uCD94\uCC9C #${O}\uC21C\uC704 \uB4F1)`);let T=`\uB2F9\uC2E0\uC740 \uB124\uC774\uBC84 \uBE14\uB85C\uADF8\uC5D0 OTT \uCF58\uD150\uCE20 \uAE00\uC744 \uB9E4\uC77C \uC4F0\uB294 30\uB300 \uC9C1\uC7A5\uC778\uC785\uB2C8\uB2E4.
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
${s==="weekly_ranking"?E.length>1?"\uC21C\uC704 \uB098\uC5F4: \uCE74\uD14C\uACE0\uB9AC\uBCC4\uB85C \uC139\uC158\uC744 \uB098\uB220\uC11C \uAC01\uAC01 10\uC704\u21921\uC704 \uC5ED\uC21C\uC73C\uB85C \uC791\uC131 (\uC11C\uB85C \uB2E4\uB978 \uCE74\uD14C\uACE0\uB9AC\uB97C \uD558\uB098\uC758 \uC21C\uC704 \uB9AC\uC2A4\uD2B8\uB85C \uD569\uCE58\uC9C0 \uB9D0 \uAC83)":"\uC21C\uC704 \uB098\uC5F4: 10\uC704\u21921\uC704 \uC5ED\uC21C (\uB05D\uAE4C\uC9C0 \uC77D\uAC8C \uC720\uB3C4)":""}

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

\uB9C8\uD06C\uB2E4\uC6B4 \uAE30\uD638 \uC5C6\uC774 \uC77C\uBC18 \uD14D\uC2A4\uD2B8\uB85C, \uB2E8\uB77D \uAD6C\uBD84\uC740 \uBE48 \uC904\uB85C\uB9CC \uD574\uC8FC\uC138\uC694.`,L=await Ut(T,o,{useWebSearch:R,maxTokens:R?5e3:4096});if(!L)throw new Error("AI \uC751\uB2F5\uC774 \uBE44\uC5B4\uC788\uC2B5\uB2C8\uB2E4. \uB2E4\uC2DC \uC2DC\uB3C4\uD574\uC8FC\uC138\uC694.");return new Response(JSON.stringify({ok:!0,post:L,rankingData:E,meta:{platform:c,platformName:O,weekInfo:y,categorySlot:k||"all",categoryLabel:k&&E.length===1?E[0].display_name:"\uC804\uCCB4",generatedAt:new Date().toISOString()}}),{headers:e})}catch(E){return new Response(JSON.stringify({ok:!1,error:E.message}),{status:500,headers:e})}}return null}var Pt=["ad","bug"],$t=["pending","answered","resolved"],xt=5,pt=30;async function mt(d,i,t,g,e,o){if(d==="/inquiry"&&i.method==="POST")try{let s=await i.json(),{type:r,name:a,email:l,phone:p,title:_,content:f,page_url:u,website:m}=s;if(m)return new Response(JSON.stringify({ok:!0}),{headers:o});if(!Pt.includes(r))return new Response(JSON.stringify({ok:!1,message:"type\uC740 ad \uB610\uB294 bug\uC5EC\uC57C \uD569\uB2C8\uB2E4"}),{status:400,headers:o});if(!_||!_.trim()||!f||!f.trim())return new Response(JSON.stringify({ok:!1,message:"\uC81C\uBAA9\uACFC \uB0B4\uC6A9\uC740 \uD544\uC218\uC785\uB2C8\uB2E4"}),{status:400,headers:o});if(r==="ad"){if(!a||!a.trim())return new Response(JSON.stringify({ok:!1,message:"\uB2F4\uB2F9\uC790\uBA85 \uB610\uB294 \uC5C5\uCCB4\uBA85\uC744 \uC785\uB825\uD574\uC8FC\uC138\uC694"}),{status:400,headers:o});if(!l||!l.trim())return new Response(JSON.stringify({ok:!1,message:"\uC774\uBA54\uC77C\uC744 \uC785\uB825\uD574\uC8FC\uC138\uC694"}),{status:400,headers:o})}if(l&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(l))return new Response(JSON.stringify({ok:!1,message:"\uC774\uBA54\uC77C \uD615\uC2DD\uC774 \uC62C\uBC14\uB974\uC9C0 \uC54A\uC2B5\uB2C8\uB2E4"}),{status:400,headers:o});let k=r,E=String(_).slice(0,200),w=String(f).slice(0,5e3),y=a?String(a).slice(0,100):null,O=l?String(l).slice(0,200):null,N=p?String(p).slice(0,30):null,R=u?String(u).slice(0,500):null,D=i.headers.get("User-Agent")||null,S=i.headers.get("CF-Connecting-IP")||null,T=null;try{let L=i.headers.get("Authorization")||"",I=(L.startsWith("Bearer ")?L.slice(7).trim():null)||h(i);if(I){let B=await t.DB.prepare("SELECT user_id AS id FROM sessions WHERE id = ? LIMIT 1").bind(I).first();B&&(T=B.id)}}catch{}return S&&((await t.DB.prepare(`SELECT COUNT(*) as cnt FROM inquiries
           WHERE ip_address = ? AND created_at > datetime('now', '-1 hour')`).bind(S).first())?.cnt||0)>=xt&&await t.DB.prepare(`SELECT id FROM inquiries
             WHERE ip_address = ? AND created_at > datetime('now', '-${pt} seconds')
             LIMIT 1`).bind(S).first()?new Response(JSON.stringify({ok:!1,message:`\uC9E7\uC740 \uC2DC\uAC04\uC5D0 \uB108\uBB34 \uB9CE\uC774 \uC81C\uCD9C\uB410\uC5B4\uC694. ${pt}\uCD08 \uD6C4 \uB2E4\uC2DC \uC2DC\uB3C4\uD574\uC8FC\uC138\uC694.`}),{status:429,headers:o}):(await t.DB.prepare(`
        INSERT INTO inquiries (
          type, name, email, phone, title, content, page_url,
          user_agent, ip_address, user_id, status, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', datetime('now'), datetime('now'))
      `).bind(k,y,O,N,E,w,R,D,S,T).run(),new Response(JSON.stringify({ok:!0}),{headers:o}))}catch(s){return new Response(JSON.stringify({ok:!1,message:s.message}),{status:500,headers:o})}let n=d.match(/^\/admin\/inquiry\/(\d+)$/);if(i.method==="DELETE"&&n){if(i.headers.get("Authorization")!==`Bearer ${t.ADMIN_SECRET}`)return new Response(JSON.stringify({ok:!1,message:"Unauthorized"}),{status:401,headers:o});try{return await t.DB.prepare("DELETE FROM inquiries WHERE id = ?").bind(n[1]).run(),new Response(JSON.stringify({ok:!0}),{headers:o})}catch(s){return new Response(JSON.stringify({ok:!1,message:s.message}),{status:500,headers:o})}}let c=d.match(/^\/admin\/inquiry\/(\d+)$/);if(i.method==="PATCH"&&c){if(i.headers.get("Authorization")!==`Bearer ${t.ADMIN_SECRET}`)return new Response(JSON.stringify({ok:!1,message:"Unauthorized"}),{status:401,headers:o});try{let s=await i.json(),{status:r,admin_reply:a}=s;return r&&!$t.includes(r)?new Response(JSON.stringify({ok:!1,message:"status \uAC12\uC774 \uC62C\uBC14\uB974\uC9C0 \uC54A\uC2B5\uB2C8\uB2E4"}),{status:400,headers:o}):await t.DB.prepare("SELECT id FROM inquiries WHERE id = ?").bind(c[1]).first()?(await t.DB.prepare(`
        UPDATE inquiries
        SET status      = COALESCE(?, status),
            admin_reply = COALESCE(?, admin_reply),
            updated_at  = datetime('now')
        WHERE id = ?
      `).bind(r||null,a??null,c[1]).run(),new Response(JSON.stringify({ok:!0}),{headers:o})):new Response(JSON.stringify({ok:!1,message:"\uCC3E\uC744 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4"}),{status:404,headers:o})}catch(s){return new Response(JSON.stringify({ok:!1,message:s.message}),{status:500,headers:o})}}if(d==="/admin/inquiry"&&i.method==="GET"){if(i.headers.get("Authorization")!==`Bearer ${t.ADMIN_SECRET}`)return new Response(JSON.stringify({ok:!1,message:"Unauthorized"}),{status:401,headers:o});try{let s=e.searchParams.get("type")||"all",r=e.searchParams.get("status")||"all",a=Math.min(parseInt(e.searchParams.get("limit")||"50"),100),l=Math.max(parseInt(e.searchParams.get("offset")||"0"),0),p=[],_=[];s!=="all"&&(p.push("type = ?"),_.push(s)),r!=="all"&&(p.push("status = ?"),_.push(r));let f=p.length?`WHERE ${p.join(" AND ")}`:"",[u,m]=await t.DB.batch([t.DB.prepare(`SELECT * FROM inquiries ${f} ORDER BY created_at DESC LIMIT ? OFFSET ?`).bind(..._,a,l),t.DB.prepare(`SELECT COUNT(*) as cnt FROM inquiries ${f}`).bind(..._)]),k=u.results||[],E=m.results?.[0]?.cnt||0;return new Response(JSON.stringify({ok:!0,data:k,total:E}),{headers:o})}catch(s){return new Response(JSON.stringify({ok:!1,message:s.message}),{status:500,headers:o})}}return null}async function ut(d,i,t){if(!await b(d,i))return new Response(JSON.stringify({ok:!1,error:"\uAD00\uB9AC\uC790 \uC778\uC99D\uC774 \uD544\uC694\uD569\uB2C8\uB2E4."}),{status:401,headers:t});try{let e=await i.DB.prepare("SELECT MAX(date) AS latest_date FROM rankings WHERE date != 'manual'").first();if(!e||!e.latest_date)return new Response(JSON.stringify({ok:!1,error:"rankings \uD14C\uC774\uBE14\uC5D0 \uC720\uD6A8\uD55C \uD06C\uB864\uB9C1 \uB370\uC774\uD130\uAC00 \uC5C6\uC2B5\uB2C8\uB2E4."}),{status:404,headers:t});let o=e.latest_date,n=`
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
    `,{results:c}=await i.DB.prepare(n).bind(o).all(),{results:s}=await i.DB.prepare("SELECT tmdb_id, boost_value, is_pinned, pinned_score, pinned_platform FROM admin_boosts").all(),r=new Map((s||[]).map(m=>[m.tmdb_id,m]));if((!c||c.length===0)&&r.size===0)return new Response(JSON.stringify({ok:!1,error:"\uACC4\uC0B0\uD560 \uB7AD\uD0B9 \uB370\uC774\uD130\uAC00 \uC5C6\uC2B5\uB2C8\uB2E4."}),{status:404,headers:t});let a=[],l=new Set;for(let m of c||[]){l.add(m.tmdb_id);let k=r.get(m.tmdb_id);k&&k.is_pinned?a.push({tmdb_id:m.tmdb_id,best_platform:k.pinned_platform||m.best_platform,best_rank:m.best_rank,rank_score:0,platform_weight:0,weighted_score:0,admin_boost:k.pinned_score??0}):a.push(m)}for(let[m,k]of r)l.has(m)||(k.is_pinned?a.push({tmdb_id:m,best_platform:k.pinned_platform||"manual",best_rank:null,rank_score:0,platform_weight:0,weighted_score:0,admin_boost:k.pinned_score??0}):k.boost_value&&a.push({tmdb_id:m,best_platform:k.pinned_platform||"manual",best_rank:null,rank_score:0,platform_weight:0,weighted_score:0,admin_boost:k.boost_value}));a.sort((m,k)=>k.weighted_score+k.admin_boost-(m.weighted_score+m.admin_boost));let p=new Date(Date.now()+540*60*1e3).toISOString().slice(0,19).replace("T"," "),_=[i.DB.prepare("DELETE FROM hot100_scores")];for(let m of a){let k=m.weighted_score+m.admin_boost;_.push(i.DB.prepare(`INSERT INTO hot100_scores
            (tmdb_id, calc_date, best_platform, platform_weight,
             rank_score, weighted_rank_score, engagement_score,
             admin_boost, total_score, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?, ?)`).bind(m.tmdb_id,o,m.best_platform,m.platform_weight,m.rank_score,m.weighted_score,m.admin_boost,k,p))}await i.DB.batch(_);let f=a.filter(m=>m.best_platform==="netflix").slice(0,20),u=0;if(f.length>0){let m=f.map(O=>O.tmdb_id),k=m.map(()=>"?").join(","),{results:E}=await i.DB.prepare(`SELECT tmdb_id, title_ko, title_en, poster_path, genre, tmdb_rating, release_year
         FROM works WHERE tmdb_id IN (${k})`).bind(...m).all(),w=new Map((E||[]).map(O=>[O.tmdb_id,O])),y=[i.DB.prepare("DELETE FROM rankings WHERE platform = 'netflix' AND category_slot = 'category10' AND date = ?").bind(o)];f.forEach((O,N)=>{let R=w.get(O.tmdb_id)||{};y.push(i.DB.prepare(`INSERT INTO rankings
              (platform, category_slot, category, date, rank, tmdb_id,
               title_ko, title_en, poster_path, release_year, genre, tmdb_rating,
               is_manual, source_name)
             VALUES ('netflix', 'category10', 'category10', ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 'HOT100 \uAE30\uBC18 \uD1B5\uD569\uB7AD\uD0B9')`).bind(o,N+1,O.tmdb_id,R.title_ko||"",R.title_en||"",R.poster_path||null,R.release_year||null,R.genre||null,R.tmdb_rating||null))}),await i.DB.batch(y),u=f.length}return new Response(JSON.stringify({ok:!0,netflix_overall_saved:u,calc_date:o,total_works:a.length,top10_preview:a.slice(0,10).map(m=>({tmdb_id:m.tmdb_id,best_platform:m.best_platform,best_rank:m.best_rank,total_score:m.weighted_score+m.admin_boost}))}),{status:200,headers:t})}catch(e){return console.error("calcHot100 \uC624\uB958:",e),new Response(JSON.stringify({ok:!1,error:"HOT100 \uACC4\uC0B0 \uC911 \uC624\uB958\uAC00 \uBC1C\uC0DD\uD588\uC2B5\uB2C8\uB2E4.",detail:e.message}),{status:500,headers:t})}}async function ft(d,i,t){if(!await b(d,i))return new Response(JSON.stringify({ok:!1,error:"\uAD00\uB9AC\uC790 \uC778\uC99D\uC774 \uD544\uC694\uD569\uB2C8\uB2E4."}),{status:401,headers:t});try{let{results:e}=await i.DB.prepare(`SELECT ab.tmdb_id, ab.boost_value, ab.reason, ab.is_pinned, ab.pinned_score, ab.pinned_platform, ab.updated_at,
              w.title_ko, w.poster_path
       FROM admin_boosts ab
       LEFT JOIN works w ON w.tmdb_id = ab.tmdb_id
       ORDER BY ab.updated_at DESC`).all();return new Response(JSON.stringify({ok:!0,data:e||[]}),{status:200,headers:t})}catch(e){return new Response(JSON.stringify({ok:!1,error:e.message}),{status:500,headers:t})}}async function gt(d,i,t){if(!await b(d,i))return new Response(JSON.stringify({ok:!1,error:"\uAD00\uB9AC\uC790 \uC778\uC99D\uC774 \uD544\uC694\uD569\uB2C8\uB2E4."}),{status:401,headers:t});try{let o=(new URL(d.url).searchParams.get("q")||"").trim();if(!o)return new Response(JSON.stringify({ok:!0,data:[]}),{status:200,headers:t});let{results:n}=await i.DB.prepare(`SELECT w.tmdb_id, w.title_ko, w.title_en, w.poster_path,
              COALESCE(ab.boost_value, 0) AS boost_value,
              COALESCE(ab.is_pinned, 0) AS is_pinned,
              ab.pinned_score,
              ab.pinned_platform
       FROM works w
       LEFT JOIN admin_boosts ab ON ab.tmdb_id = w.tmdb_id
       WHERE w.title_ko LIKE ? OR w.title_en LIKE ? OR w.tmdb_id = ?
       ORDER BY w.tmdb_id DESC
       LIMIT 20`).bind(`%${o}%`,`%${o}%`,parseInt(o,10)||0).all();return new Response(JSON.stringify({ok:!0,data:n||[]}),{status:200,headers:t})}catch(e){return new Response(JSON.stringify({ok:!1,error:e.message}),{status:500,headers:t})}}async function Et(d,i,t){if(!await b(d,i))return new Response(JSON.stringify({ok:!1,error:"\uAD00\uB9AC\uC790 \uC778\uC99D\uC774 \uD544\uC694\uD569\uB2C8\uB2E4."}),{status:401,headers:t});try{let e=await d.json(),{tmdb_id:o,boost_value:n,reason:c,is_pinned:s,pinned_score:r,pinned_platform:a}=e;if(!o)return new Response(JSON.stringify({ok:!1,error:"tmdb_id\uAC00 \uD544\uC694\uD569\uB2C8\uB2E4."}),{status:400,headers:t});let l=E=>Object.prototype.hasOwnProperty.call(e,E),p=null;(!l("boost_value")||!l("is_pinned")||!l("pinned_score")||!l("pinned_platform"))&&(p=await i.DB.prepare("SELECT boost_value, is_pinned, pinned_score, pinned_platform FROM admin_boosts WHERE tmdb_id = ?").bind(o).first());let _=l("boost_value")?n||0:p?.boost_value??0,f=l("is_pinned")?s?1:0:p?.is_pinned||0,u=l("pinned_score")?r??0:p?.pinned_score??null,m=l("pinned_platform")?a||null:p?.pinned_platform??null,k=new Date(Date.now()+540*60*1e3).toISOString().slice(0,19).replace("T"," ");return await i.DB.prepare(`INSERT INTO admin_boosts (tmdb_id, boost_value, reason, is_pinned, pinned_score, pinned_platform, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(tmdb_id) DO UPDATE SET
         boost_value = excluded.boost_value,
         reason = excluded.reason,
         is_pinned = excluded.is_pinned,
         pinned_score = excluded.pinned_score,
         pinned_platform = excluded.pinned_platform,
         updated_at = excluded.updated_at`).bind(o,_,c||null,f,u,m,k).run(),new Response(JSON.stringify({ok:!0}),{status:200,headers:t})}catch(e){return new Response(JSON.stringify({ok:!1,error:e.message}),{status:500,headers:t})}}async function wt(d,i,t,g){if(!await b(i,t))return new Response(JSON.stringify({ok:!1,error:"\uAD00\uB9AC\uC790 \uC778\uC99D\uC774 \uD544\uC694\uD569\uB2C8\uB2E4."}),{status:401,headers:g});try{return await t.DB.prepare("DELETE FROM admin_boosts WHERE tmdb_id = ?").bind(d).run(),new Response(JSON.stringify({ok:!0}),{status:200,headers:g})}catch(o){return new Response(JSON.stringify({ok:!1,error:o.message}),{status:500,headers:g})}}async function kt(d,i,t){try{let g=new URL(d.url),e=parseInt(g.searchParams.get("limit")||"100",10),o=Number.isNaN(e)?100:Math.min(e,100),n=`
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
        w.hero_title_baked_in,
        w.media_type,
        ROUND(w.tmdb_rating, 1) AS tmdb_rating,
        w.release_year
      FROM hot100_scores h
      LEFT JOIN works w ON w.tmdb_id = h.tmdb_id
      LEFT JOIN admin_boosts ab ON ab.tmdb_id = h.tmdb_id
      ORDER BY h.total_score DESC, w.tmdb_rating DESC
      LIMIT ?
    `,{results:c}=await i.DB.prepare(n).bind(o).all();return!c||c.length===0?new Response(JSON.stringify({ok:!0,data:[]}),{status:200,headers:t}):new Response(JSON.stringify({ok:!0,data:c.map((s,r)=>({hot_rank:r+1,...s}))}),{status:200,headers:t})}catch(g){return console.error("getHot100 \uC624\uB958:",g),new Response(JSON.stringify({ok:!1,error:"HOT100 \uC870\uD68C \uC911 \uC624\uB958\uAC00 \uBC1C\uC0DD\uD588\uC2B5\uB2C8\uB2E4.",detail:g.message}),{status:500,headers:t})}}async function yt(d,i,t){if(!await b(d,i))return new Response(JSON.stringify({ok:!1,error:"\uAD00\uB9AC\uC790 \uC778\uC99D\uC774 \uD544\uC694\uD569\uB2C8\uB2E4."}),{status:401,headers:t});try{let{results:e}=await i.DB.prepare(`SELECT platform, category_slot, top_n, display_order, is_active
       FROM hot100_frontend_tabs
       ORDER BY display_order ASC`).all();return new Response(JSON.stringify({ok:!0,data:e||[]}),{status:200,headers:t})}catch(e){return new Response(JSON.stringify({ok:!1,error:e.message}),{status:500,headers:t})}}async function Rt(d,i,t,g){if(!await b(i,t))return new Response(JSON.stringify({ok:!1,error:"\uAD00\uB9AC\uC790 \uC778\uC99D\uC774 \uD544\uC694\uD569\uB2C8\uB2E4."}),{status:401,headers:g});try{let o=await i.json(),{category_slot:n,top_n:c,display_order:s,is_active:r}=o;return await t.DB.prepare(`UPDATE hot100_frontend_tabs SET
         category_slot = COALESCE(?, category_slot),
         top_n         = COALESCE(?, top_n),
         display_order = COALESCE(?, display_order),
         is_active     = COALESCE(?, is_active)
       WHERE platform = ?`).bind(n??null,c??null,s??null,r??null,d).run(),new Response(JSON.stringify({ok:!0}),{status:200,headers:g})}catch(o){return new Response(JSON.stringify({ok:!1,error:o.message}),{status:500,headers:g})}}async function St(d,i,t){try{let g={all:"\uC804\uCCB4",netflix:"\uB137\uD50C\uB9AD\uC2A4",tving:"\uD2F0\uBE59",disney:"\uB514\uC988\uB2C8+",coupang:"\uCFE0\uD321\uD50C\uB808\uC774",wavve:"\uC6E8\uC774\uBE0C",boxoffice:"\uBC15\uC2A4\uC624\uD53C\uC2A4"},{results:e}=await i.DB.prepare(`SELECT platform, category_slot, top_n, display_order
       FROM hot100_frontend_tabs
       WHERE is_active = 1
       ORDER BY display_order ASC`).all();if(!e||e.length===0)return new Response(JSON.stringify({ok:!0,tabs:[]}),{status:200,headers:t});let o=[];for(let n of e){let c=n.top_n||10;if(n.platform==="all"){let{results:_}=await i.DB.prepare(`SELECT h.tmdb_id, h.best_platform, w.title_ko, w.title_en,
                  w.poster_path, w.hero_backdrop_path, w.hero_title_baked_in,
                  w.media_type, ROUND(w.tmdb_rating, 1) AS tmdb_rating
           FROM hot100_scores h
           LEFT JOIN works w ON w.tmdb_id = h.tmdb_id
           ORDER BY h.total_score DESC
           LIMIT ?`).bind(c).all();o.push({platform:"all",label:g.all,items:(_||[]).map((f,u)=>({rank:u+1,tmdb_id:f.tmdb_id,best_platform:f.best_platform,title_ko:f.title_ko,title_en:f.title_en,poster_path:f.poster_path,hero_backdrop_path:f.hero_backdrop_path,hero_title_baked_in:f.hero_title_baked_in,media_type:f.media_type,tmdb_rating:f.tmdb_rating}))});continue}if(!n.category_slot)continue;let r=(await i.DB.prepare("SELECT MAX(date) AS latest FROM rankings WHERE platform = ? AND category_slot = ? AND date != 'manual'").bind(n.platform,n.category_slot).first())?.latest||null,{results:a}=r?await i.DB.prepare(`SELECT r.rank, r.tmdb_id, r.title_ko, r.title_en, r.poster_path,
                    w.hero_backdrop_path, w.hero_title_baked_in, w.media_type, ROUND(w.tmdb_rating, 1) AS tmdb_rating
             FROM rankings r
             LEFT JOIN works w ON w.tmdb_id = r.tmdb_id
             WHERE r.platform = ? AND r.category_slot = ? AND r.date = ?
             ORDER BY r.rank ASC`).bind(n.platform,n.category_slot,r).all():{results:[]},{results:l}=await i.DB.prepare(`SELECT r.rank, r.tmdb_id, r.title_ko, r.title_en, r.poster_path,
                w.hero_backdrop_path, w.hero_title_baked_in, w.media_type, ROUND(w.tmdb_rating, 1) AS tmdb_rating
         FROM rankings r
         LEFT JOIN works w ON w.tmdb_id = r.tmdb_id
         WHERE r.platform = ? AND r.category_slot = ? AND r.is_manual = 1 AND r.date = 'manual'
         ORDER BY r.rank ASC`).bind(n.platform,n.category_slot).all(),p=$(a||[],l||[],c);o.push({platform:n.platform,label:g[n.platform]||n.platform,items:p.map(_=>({rank:_.rank,tmdb_id:_.tmdb_id,best_platform:n.platform,title_ko:_.title_ko,title_en:_.title_en,poster_path:_.poster_path,hero_backdrop_path:_.hero_backdrop_path,hero_title_baked_in:_.hero_title_baked_in,media_type:_.media_type,tmdb_rating:_.tmdb_rating}))})}return new Response(JSON.stringify({ok:!0,tabs:o}),{status:200,headers:t})}catch(g){return new Response(JSON.stringify({ok:!1,error:"\uD788\uC5B4\uB85C \uD0ED \uC870\uD68C \uC911 \uC624\uB958\uAC00 \uBC1C\uC0DD\uD588\uC2B5\uB2C8\uB2E4.",detail:g.message}),{status:500,headers:t})}}var he={async fetch(d,i,t){let g=new URL(d.url),e=g.pathname,o=d.headers.get("Origin")||"https://ottrank.kr",c=["https://ottrank.kr","http://localhost:8788","http://localhost:3000"].includes(o)?o:"https://ottrank.kr",s={"Content-Type":"application/json","Access-Control-Allow-Origin":c,"Access-Control-Allow-Credentials":"true"};if(d.method==="OPTIONS")return new Response(null,{headers:{"Access-Control-Allow-Origin":c,"Access-Control-Allow-Credentials":"true","Access-Control-Allow-Methods":"GET, POST, PUT, PATCH, DELETE, OPTIONS","Access-Control-Allow-Headers":"Content-Type, Authorization"}});let r=null;(e.startsWith("/contents")||e.startsWith("/admin/contents"))&&(r=await it(e,d,i,g,s)),!r&&e.startsWith("/auth/")&&(r=await tt(e,d,i,s)),!r&&(e.startsWith("/rankings")||e==="/latest-date"||e==="/platforms"||e==="/sitemap.xml")&&(r=await G(e,d,i,g,s)),!r&&(e.startsWith("/videos/")||e.startsWith("/admin/videos")||e.startsWith("/imdb/")||e.startsWith("/youtube/")||e.startsWith("/works/")||e.startsWith("/kmrb/")||e.startsWith("/search/"))&&(r=await v(e,d,i,t,g,s)),!r&&(e.startsWith("/reactions")||e.startsWith("/admin/reactions"))&&(r=await q(e,d,i,t,s)),!r&&(e.startsWith("/wishlist")||e.startsWith("/reviews")||e.startsWith("/mypage")||e.startsWith("/user/")||e==="/grade-settings"||e.startsWith("/life-works")||e.startsWith("/pick-lists")||e.startsWith("/admin/reviews"))&&(r=await et(e,d,i,t,s)),!r&&e.startsWith("/posts")&&(r=await st(e,d,i,t,g,s)),!r&&e.startsWith("/blog-gen")&&(r=await _t(e,d,i,g,s)),!r&&e.startsWith("/work-ott")&&(r=await Y(e,d,i,g,s)),!r&&(e==="/inquiry"||e.startsWith("/admin/inquiry"))&&(r=await mt(e,d,i,t,g,s)),!r&&e==="/admin/calc-hot100"&&(r=await ut(d,i,s)),!r&&e==="/hot100"&&(r=await kt(d,i,s)),!r&&e==="/hot100/hero-tabs"&&(r=await St(d,i,s)),!r&&e==="/admin/hot100/boosts/search"&&d.method==="GET"&&(r=await gt(d,i,s)),!r&&e==="/admin/hot100/boosts"&&d.method==="GET"&&(r=await ft(d,i,s)),!r&&e==="/admin/hot100/boosts"&&d.method==="POST"&&(r=await Et(d,i,s));let a=e.match(/^\/admin\/hot100\/boosts\/(\d+)$/);!r&&a&&d.method==="DELETE"&&(r=await wt(parseInt(a[1],10),d,i,s)),!r&&e==="/admin/hot100/frontend-tabs"&&d.method==="GET"&&(r=await yt(d,i,s));let l=e.match(/^\/admin\/hot100\/frontend-tabs\/([a-z]+)$/);return!r&&l&&d.method==="PATCH"&&(r=await Rt(l[1],d,i,s)),!r&&e.startsWith("/admin/")&&(r=await Y(e,d,i,g,s)),r||(r=new Response(JSON.stringify({ok:!1,message:"Not found"}),{status:404,headers:s})),r}};export{he as default};
