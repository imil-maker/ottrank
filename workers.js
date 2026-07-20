function Z(r,i,t){if(!i.length)return r.slice(0,t).map((c,s)=>({...c,rank:s+1}));let f=new Set(i.map(c=>c.tmdb_id).filter(Boolean)),e=r.filter(c=>!f.has(c.tmdb_id)),o={};for(let c of i){let s=Math.max(1,parseInt(c.rank)||1);o[s]||(o[s]=[]),o[s].push(c)}let n=[],p=0,_=1;for(;n.length<t;){if(o[_]&&o[_].length){let c=o[_].shift();n.push({...c,rank:n.length+1})}else if(p<e.length)n.push({...e[p],rank:n.length+1}),p++;else{let c=Object.values(o).flat();for(let s of c){if(n.length>=t)break;n.push({...s,rank:n.length+1})}break}_++}return n}async function it(r,i){if(!i||!i.length)return[];let t=i.map(e=>r.DB.prepare(`
      SELECT platform, category_slot, rank, title_ko, title_en, tmdb_id,
             poster_path, genre, tmdb_rating, release_year, memo, date
      FROM rankings
      WHERE platform = ? AND category_slot = ?
        AND date = (
          SELECT MAX(date) FROM rankings
          WHERE platform = ? AND category_slot = ? AND date != 'manual'
        )
      ORDER BY rank ASC
    `).bind(e.platform,e.category_slot,e.platform,e.category_slot));return(await r.DB.batch(t)).flatMap(e=>e.results||[])}async function at(r,i,t,f,e){if(r==="/rankings"&&i.method==="GET"){let o=f.searchParams.get("platform"),n=f.searchParams.get("category"),p=f.searchParams.get("date"),_="SELECT * FROM rankings WHERE 1=1",c=[];o&&(_+=" AND platform = ?",c.push(o)),n&&(_+=" AND category = ?",c.push(n)),p?(_+=" AND date = ?",c.push(p)):_+=" AND date = (SELECT value FROM app_settings WHERE key = 'latest_ranking_date')",_+=" ORDER BY platform, category, rank";let{results:s}=await t.DB.prepare(_).bind(...c).all();return new Response(JSON.stringify({ok:!0,data:s}),{headers:e})}if(r==="/rankings/main"&&i.method==="GET")try{let o=f.searchParams.get("date")||null,[n,p,_]=await t.DB.batch([t.DB.prepare(`
          SELECT platform, category_slot, display_name, main_section, main_order, main_limit, memo_label
          FROM ott_categories
          WHERE main_section IS NOT NULL AND is_active = 1
        `),t.DB.prepare(`
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
        `).bind(o),t.DB.prepare(`
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
        `)]),c=n.results,s=p.results,a=_.results,d={};for(let R of c)d[`${R.platform}__${R.category_slot}`]=R;let l={},m={};for(let R of s){let S=`${R.platform}__${R.category_slot}`;l[S]||(l[S]=[]),l[S].push(R)}for(let R of a){let S=`${R.platform}__${R.category_slot}`;m[S]||(m[S]=[]),m[S].push(R)}if(!o){let R=c.filter(S=>!l[`${S.platform}__${S.category_slot}`]&&!m[`${S.platform}__${S.category_slot}`]);if(R.length){let S=await it(t,R);for(let h of S){let b=`${h.platform}__${h.category_slot}`;l[b]||(l[b]=[]),l[b].push(h)}}}let u={},E={},w={},g=new Set([...Object.keys(l),...Object.keys(m)]);for(let R of g){let S=d[R];if(!S)continue;let h=S.main_limit||10,b=Z((l[R]||[]).sort((N,T)=>N.rank-T.rank),(m[R]||[]).sort((N,T)=>N.rank-T.rank),h);for(let N of b){let T={rank:N.rank,title_ko:N.title_ko,title_en:N.title_en,tmdb_id:N.tmdb_id,poster_path:N.poster_path,genre:N.genre,tmdb_rating:N.tmdb_rating,release_year:N.release_year,memo:N.memo||null,display_name:S.display_name,platform:S.platform,category_slot:S.category_slot,main_order:S.main_order};S.main_section==="tv"?(u[R]||(u[R]={platform:S.platform,category_slot:S.category_slot,display_name:S.display_name,main_order:S.main_order,memo_label:S.memo_label||null,items:[]}),u[R].items.push(T)):S.main_section==="movie"?(E[R]||(E[R]={platform:S.platform,category_slot:S.category_slot,display_name:S.display_name,main_order:S.main_order,memo_label:S.memo_label||null,items:[]}),E[R].items.push(T)):S.main_section==="featured"&&S.platform==="netflix"&&(w[R]||(w[R]={platform:S.platform,category_slot:S.category_slot,display_name:S.display_name,main_order:S.main_order,memo_label:S.memo_label||null,items:[]}),w[R].items.push(T))}}let y=Object.values(u).sort((R,S)=>R.main_order-S.main_order),k=Object.values(E).sort((R,S)=>R.main_order-S.main_order),O=Object.values(w).sort((R,S)=>R.main_order-S.main_order).slice(0,2);return new Response(JSON.stringify({ok:!0,tv:y,movie:k,featured:O}),{headers:e})}catch(o){return new Response(JSON.stringify({ok:!1,message:o.message}),{status:500,headers:e})}if(r==="/rankings/platform"&&i.method==="GET")try{let o=f.searchParams.get("platform"),n=f.searchParams.get("date")||null;if(!o)return new Response(JSON.stringify({ok:!1,message:"platform required"}),{status:400,headers:e});let[p,_,c]=await t.DB.batch([t.DB.prepare(`
          SELECT platform, category_slot, display_name, platform_section, platform_order, platform_limit, memo_label
          FROM ott_categories
          WHERE platform = ? AND platform_section IS NOT NULL AND is_active = 1
        `).bind(o),t.DB.prepare(`
          SELECT
            r.platform, r.category_slot, r.rank, r.title_ko, r.title_en,
            r.tmdb_id, r.poster_path, r.genre, r.tmdb_rating, r.release_year, r.memo,
            bs.audi_cnt AS audi_cnt
          FROM rankings r
          JOIN ott_categories oc
            ON r.platform = oc.platform AND r.category_slot = oc.category_slot
          LEFT JOIN boxoffice_stats bs
            ON r.platform = 'boxoffice' AND r.tmdb_id = bs.tmdb_id AND r.date = bs.date
          WHERE r.platform = ?
            AND oc.platform_section IS NOT NULL
            AND oc.is_active = 1
            AND r.date = COALESCE(?, (SELECT value FROM app_settings WHERE key = 'latest_ranking_date'))
            AND r.rank <= oc.platform_limit + 20
          ORDER BY oc.platform_order, r.rank
        `).bind(o,n),t.DB.prepare(`
          SELECT
            r.platform, r.category_slot, r.rank, r.title_ko, r.title_en,
            r.tmdb_id, r.poster_path, r.genre, r.tmdb_rating, r.release_year, r.memo,
            NULL AS audi_cnt
          FROM rankings r
          JOIN ott_categories oc
            ON r.platform = oc.platform AND r.category_slot = oc.category_slot
          WHERE r.platform = ?
            AND oc.platform_section IS NOT NULL
            AND oc.is_active = 1
            AND r.is_manual = 1
            AND r.date = 'manual'
          ORDER BY oc.platform_order, r.rank
        `).bind(o)]),s=p.results,a=_.results,d=c.results,l={};for(let y of s)l[y.category_slot]=y;let m={},u={};for(let y of a){let k=y.category_slot;m[k]||(m[k]=[]),m[k].push(y)}for(let y of d){let k=y.category_slot;u[k]||(u[k]=[]),u[k].push(y)}if(!n){let y=s.filter(k=>!m[k.category_slot]&&!u[k.category_slot]);if(y.length){let k=await it(t,y);for(let O of k){let R=O.category_slot;m[R]||(m[R]=[]),m[R].push(O)}}}let E={},w=new Set([...Object.keys(m),...Object.keys(u)]);for(let y of w){let k=l[y];if(!k)continue;let O=k.platform_limit||20,R=Z((m[y]||[]).sort((S,h)=>S.rank-h.rank),(u[y]||[]).sort((S,h)=>S.rank-h.rank),O);E[y]={platform:k.platform,category_slot:k.category_slot,display_name:k.display_name,platform_order:k.platform_order,memo_label:k.memo_label||null,items:R.map(S=>({rank:S.rank,title_ko:S.title_ko,title_en:S.title_en,tmdb_id:S.tmdb_id,poster_path:S.poster_path,genre:S.genre,tmdb_rating:S.tmdb_rating,release_year:S.release_year,memo:S.memo||null,audi_cnt:S.audi_cnt||null}))}}let g=Object.values(E).sort((y,k)=>y.platform_order-k.platform_order);return new Response(JSON.stringify({ok:!0,data:g}),{headers:e})}catch(o){return new Response(JSON.stringify({ok:!1,message:o.message}),{status:500,headers:e})}if(r==="/rankings/weekly"&&i.method==="GET")try{let{results:o}=await t.DB.prepare(`
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
      `).all(),n={},p={};for(let s of o){if(s.rank>(s.main_limit||10))continue;let a=`${s.platform}__${s.category_slot}`,d={rank:s.rank,title_ko:s.title_ko,title_en:s.title_en,tmdb_id:s.tmdb_id,poster_path:s.poster_path,genre:s.genre,tmdb_rating:s.tmdb_rating,release_year:s.release_year,platform:s.platform,category_slot:s.category_slot,display_name:s.display_name,main_order:s.main_order};s.main_section==="tv"?(n[a]||(n[a]={platform:s.platform,category_slot:s.category_slot,display_name:s.display_name,main_order:s.main_order,items:[]}),n[a].items.push(d)):s.main_section==="movie"&&(p[a]||(p[a]={platform:s.platform,category_slot:s.category_slot,display_name:s.display_name,main_order:s.main_order,items:[]}),p[a].items.push(d))}let _=Object.values(n).sort((s,a)=>s.main_order-a.main_order),c=Object.values(p).sort((s,a)=>s.main_order-a.main_order);return new Response(JSON.stringify({ok:!0,tv:_,movie:c}),{headers:e})}catch(o){return new Response(JSON.stringify({ok:!1,message:o.message}),{status:500,headers:e})}if(r==="/rankings/monthly"&&i.method==="GET")try{let{results:o}=await t.DB.prepare(`
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
      `).all(),n={},p={};for(let s of o){if(s.rank>(s.main_limit||10))continue;let a=`${s.platform}__${s.category_slot}`,d={rank:s.rank,title_ko:s.title_ko,title_en:s.title_en,tmdb_id:s.tmdb_id,poster_path:s.poster_path,genre:s.genre,tmdb_rating:s.tmdb_rating,release_year:s.release_year,platform:s.platform,category_slot:s.category_slot,display_name:s.display_name,main_order:s.main_order};s.main_section==="tv"?(n[a]||(n[a]={platform:s.platform,category_slot:s.category_slot,display_name:s.display_name,main_order:s.main_order,items:[]}),n[a].items.push(d)):s.main_section==="movie"&&(p[a]||(p[a]={platform:s.platform,category_slot:s.category_slot,display_name:s.display_name,main_order:s.main_order,items:[]}),p[a].items.push(d))}let _=Object.values(n).sort((s,a)=>s.main_order-a.main_order),c=Object.values(p).sort((s,a)=>s.main_order-a.main_order);return new Response(JSON.stringify({ok:!0,tv:_,movie:c}),{headers:e})}catch(o){return new Response(JSON.stringify({ok:!1,message:o.message}),{status:500,headers:e})}if(r==="/rankings/history"&&i.method==="GET"){let o=parseInt(f.searchParams.get("tmdb_id"));if(!o)return new Response(JSON.stringify({ok:!1,message:"tmdb_id required"}),{status:400,headers:e});let{results:n}=await t.DB.prepare(`
      SELECT date, platform, category_slot, rank
      FROM rankings
      WHERE tmdb_id = ?
        AND date < 'manual'
        AND date >= date((SELECT value FROM app_settings WHERE key = 'latest_ranking_date'), '-29 days')
        AND NOT (platform = 'netflix' AND category_slot = 'category10')
      ORDER BY date ASC, platform ASC
    `).bind(o).all();return new Response(JSON.stringify({ok:!0,data:n}),{headers:e})}if(r.startsWith("/rankings/platforms/")&&i.method==="GET"){let o=parseInt(r.split("/rankings/platforms/")[1]);if(!o)return new Response(JSON.stringify({ok:!1,message:"tmdb_id required"}),{status:400,headers:e});try{let{results:n}=await t.DB.prepare(`
        SELECT DISTINCT platform, MIN(rank) as rank
        FROM rankings
        WHERE tmdb_id = ?
          AND date = (SELECT value FROM app_settings WHERE key = 'latest_ranking_date')
          AND NOT (platform = 'netflix' AND category_slot = 'category10')
        GROUP BY platform
        ORDER BY rank ASC
      `).bind(o).all();return new Response(JSON.stringify({ok:!0,data:n}),{headers:e})}catch(n){return new Response(JSON.stringify({ok:!1,message:n.message}),{status:500,headers:e})}}if(r==="/rankings/platforms-batch"&&i.method==="GET"){let o=(f.searchParams.get("tmdb_ids")||"").trim();if(!o)return new Response(JSON.stringify({ok:!1,message:"tmdb_ids required"}),{status:400,headers:e});let n=[...new Set(o.split(",").map(p=>parseInt(p.trim())).filter(p=>Number.isInteger(p)&&p>0))].slice(0,50);if(!n.length)return new Response(JSON.stringify({ok:!1,message:"\uC720\uD6A8\uD55C tmdb_ids\uAC00 \uC5C6\uC2B5\uB2C8\uB2E4"}),{status:400,headers:e});try{let p=n.map(()=>"?").join(","),{results:_}=await t.DB.prepare(`
        SELECT tmdb_id, platform, MIN(rank) as rank
        FROM rankings
        WHERE tmdb_id IN (${p})
          AND date = (SELECT value FROM app_settings WHERE key = 'latest_ranking_date')
          AND NOT (platform = 'netflix' AND category_slot = 'category10')
        GROUP BY tmdb_id, platform
        ORDER BY tmdb_id, rank ASC
      `).bind(...n).all(),c={};for(let s of _)c[s.tmdb_id]||(c[s.tmdb_id]=[]),c[s.tmdb_id].push({platform:s.platform,rank:s.rank});return new Response(JSON.stringify({ok:!0,data:c}),{headers:e})}catch(p){return new Response(JSON.stringify({ok:!1,message:p.message}),{status:500,headers:e})}}if(r==="/rankings/person-widget"&&i.method==="GET")try{let o=await t.DB.prepare(`
        SELECT platform, category_slot, display_name, person_limit
        FROM ott_categories
        WHERE person_section = 'person'
          AND is_active = 1
        ORDER BY person_order ASC
        LIMIT 1
      `).first();if(!o)return new Response(JSON.stringify({ok:!0,data:null}),{headers:e});let n=o.person_limit||10,[p,_]=await t.DB.batch([t.DB.prepare(`
          SELECT r.rank, r.title_ko, r.title_en, r.tmdb_id, r.poster_path, r.genre,
                 r.tmdb_rating, r.release_year, w.media_type
          FROM rankings r
          LEFT JOIN works w ON r.tmdb_id = w.tmdb_id
          WHERE r.platform = ? AND r.category_slot = ?
            AND r.date = (SELECT value FROM app_settings WHERE key = 'latest_ranking_date')
          ORDER BY r.rank ASC
        `).bind(o.platform,o.category_slot),t.DB.prepare(`
          SELECT r.rank, r.title_ko, r.title_en, r.tmdb_id, r.poster_path, r.genre,
                 r.tmdb_rating, r.release_year, w.media_type
          FROM rankings r
          LEFT JOIN works w ON r.tmdb_id = w.tmdb_id
          WHERE r.platform = ? AND r.category_slot = ?
            AND r.is_manual = 1 AND r.date = 'manual'
          ORDER BY r.rank ASC
        `).bind(o.platform,o.category_slot)]),c=p.results,s=_.results;if(!c.length){let{results:d}=await t.DB.prepare(`
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
        `).bind(o.platform,o.category_slot,o.platform,o.category_slot).all();c=d}let a=Z(c,s,n);return new Response(JSON.stringify({ok:!0,data:{platform:o.platform,category_slot:o.category_slot,display_name:o.display_name,items:a.map(d=>({rank:d.rank,title_ko:d.title_ko,title_en:d.title_en,tmdb_id:d.tmdb_id,poster_path:d.poster_path,genre:d.genre,tmdb_rating:d.tmdb_rating,release_year:d.release_year,media_type:d.media_type||null}))}}),{headers:e})}catch(o){return new Response(JSON.stringify({ok:!1,message:o.message}),{status:500,headers:e})}if(r.startsWith("/rankings/boxoffice-stats/")&&i.method==="GET"){let o=parseInt(r.split("/rankings/boxoffice-stats/")[1]);if(!o)return new Response(JSON.stringify({ok:!1,message:"tmdb_id required"}),{status:400,headers:e});try{let{results:n}=await t.DB.prepare(`
        SELECT tmdb_id, movie_cd, date, rank, rank_inten, rank_old_and_new,
               audi_cnt, audi_acc, audi_change, sales_amt, sales_share,
               scrn_cnt, show_cnt
        FROM boxoffice_stats
        WHERE tmdb_id = ?
        ORDER BY date DESC
        LIMIT 1
      `).bind(o).all();return new Response(JSON.stringify({ok:!0,data:n[0]||null}),{headers:e})}catch(n){return new Response(JSON.stringify({ok:!1,message:n.message}),{status:500,headers:e})}}if(r.startsWith("/rankings/manual/")&&i.method==="GET"){let o=parseInt(r.split("/rankings/manual/")[1]);if(!o)return new Response(JSON.stringify({ok:!1,message:"tmdb_id required"}),{status:400,headers:e});try{let{results:n}=await t.DB.prepare(`
        SELECT
          r.rank, r.memo, r.platform, r.category_slot,
          oc.display_name, oc.memo_label
        FROM rankings r
        LEFT JOIN ott_categories oc
          ON r.platform = oc.platform AND r.category_slot = oc.category_slot
        WHERE r.tmdb_id = ? AND r.date = 'manual'
        ORDER BY r.rank ASC
      `).bind(o).all();return new Response(JSON.stringify({ok:!0,data:n}),{headers:e})}catch(n){return new Response(JSON.stringify({ok:!1,message:n.message}),{status:500,headers:e})}}if(r==="/latest-date"){let{results:o}=await t.DB.prepare("SELECT value as date FROM app_settings WHERE key = 'latest_ranking_date'").all();return new Response(JSON.stringify({ok:!0,data:o[0]}),{headers:e})}if(r==="/platforms"){let{results:o}=await t.DB.prepare("SELECT DISTINCT platform FROM rankings ORDER BY platform").all();return new Response(JSON.stringify({ok:!0,data:o}),{headers:e})}if(r==="/sitemap.xml"){try{if(t.SITEMAP_CACHE){let o=await t.SITEMAP_CACHE.get("sitemap_xml");if(o)return new Response(o,{headers:{...e,"Content-Type":"application/xml; charset=utf-8","X-Sitemap-Cache":"HIT"}})}}catch(o){console.log("sitemap cache read failed, falling back to D1:",o.message)}try{let o="https://ottrank.kr",n=new Date().getFullYear(),p=[{path:"/",changefreq:"daily",priority:"1.0"},{path:"/netflix",changefreq:"daily",priority:"0.9"},{path:"/tving",changefreq:"daily",priority:"0.9"},{path:"/disneyplus",changefreq:"daily",priority:"0.9"},{path:"/wavve",changefreq:"daily",priority:"0.9"},{path:"/coupangplay",changefreq:"daily",priority:"0.9"},{path:"/boxoffice",changefreq:"daily",priority:"0.9"},{path:"/community",changefreq:"daily",priority:"0.8"},{path:"/review",changefreq:"daily",priority:"0.8"},{path:"/reactions",changefreq:"daily",priority:"0.8"},{path:"/contents",changefreq:"daily",priority:"0.8"},{path:"/mypage",changefreq:"weekly",priority:"0.6"},{path:"/my_review",changefreq:"weekly",priority:"0.6"},{path:"/ott_intro.html",changefreq:"monthly",priority:"0.6"},{path:"/privacy",changefreq:"monthly",priority:"0.4"},{path:"/terms",changefreq:"monthly",priority:"0.4"}],{results:_}=await t.DB.prepare("SELECT tmdb_id FROM works WHERE tmdb_id IS NOT NULL ORDER BY tmdb_id").all(),{results:c}=await t.DB.prepare(`
        SELECT p.tmdb_id, w.created_at AS wiki_matched_at
        FROM persons p
        LEFT JOIN person_wiki_cache w ON w.tmdb_person_id = p.tmdb_id
        WHERE p.tmdb_id IS NOT NULL
        ORDER BY p.tmdb_id
      `).all(),s=[];for(let l of p)s.push(`  <url>
    <loc>${o}${l.path}</loc>
    <changefreq>${l.changefreq}</changefreq>
    <priority>${l.priority}</priority>
  </url>`);for(let l of _){let m=`${o}/title/1-${n}${l.tmdb_id}`;s.push(`  <url>
    <loc>${m}</loc>
    <changefreq>weekly</changefreq>
    <priority>0.7</priority>
  </url>`)}let a="2026-07-20";for(let l of c){let m=`${o}/person/${l.tmdb_id}`,u=l.wiki_matched_at?l.wiki_matched_at.slice(0,10):a;s.push(`  <url>
    <loc>${m}</loc>
    <lastmod>${u}</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.5</priority>
  </url>`)}let d=`<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
`+s.join(`
`)+`
</urlset>`;try{t.SITEMAP_CACHE&&await t.SITEMAP_CACHE.put("sitemap_xml",d,{expirationTtl:3600})}catch(l){console.log("sitemap cache write failed (non-fatal):",l.message)}return new Response(d,{headers:{...e,"Content-Type":"application/xml; charset=utf-8","X-Sitemap-Cache":"MISS"}})}catch(o){return new Response(JSON.stringify({ok:!1,message:o.message}),{status:500,headers:e})}}return null}function D(r,i){return(r.headers.get("Authorization")||"").replace("Bearer ","")===i.ADMIN_SECRET}function B(r){let t=(r.headers.get("Cookie")||"").match(/session=([^;]+)/);return t?t[1]:null}async function P(r,i,t,f){try{return await f.DB.prepare("INSERT INTO user_point_logs (user_id, points, reason) VALUES (?, ?, ?)").bind(r,i,t).run(),await f.DB.prepare("UPDATE users SET ott_points = MAX(0, COALESCE(ott_points, 0) + ?) WHERE id = ?").bind(i,r).run(),await $(r,f),!0}catch(e){return console.error("[_addOttPoints] \uC624\uB958:",e.message),!1}}async function $(r,i){try{let t=await i.DB.prepare("SELECT grade, ott_points FROM users WHERE id = ?").bind(r).first();if(!t||(await i.DB.prepare("SELECT is_special FROM grade_settings WHERE grade_key = ?").bind(t.grade||"rookie").first())?.is_special)return;let{results:e}=await i.DB.prepare(`SELECT grade_key FROM grade_settings
       WHERE is_special = 0 AND min_ott_points <= ?
       ORDER BY min_ott_points DESC LIMIT 1`).bind(t.ott_points||0).all(),o=e[0]?.grade_key||null;o&&o!==t.grade&&await i.DB.prepare("UPDATE users SET grade = ? WHERE id = ?").bind(o,r).run()}catch(t){console.error("[GRADE]",t.message)}}async function rt(r,i){try{let O=function(h){if(!h||!k.length)return!0;let b=h.toLowerCase(),N=k.filter(A=>b.includes(A.toLowerCase())).length,T=k.length<=2?1:k.length===3?2:3;return N>=T},t=await i.DB.prepare("SELECT title_ko, title_en FROM works WHERE tmdb_id = ?").bind(r).first();if(!t?.title_ko)return console.log(`[YT_CRAWL] tmdb_id=${r} works \uC5C6\uC74C \u2014 \uC2A4\uD0B5`),0;let f=t.title_ko,e=t.title_en||"",o=await i.DB.prepare("SELECT platform, category_slot FROM rankings WHERE tmdb_id = ? ORDER BY date DESC LIMIT 1").bind(r).first(),n=new Set(["category07","category08"]),_=o?.platform==="netflix"&&n.has(o?.category_slot),c=_?"en":"ko",s=_&&e||f;console.log(`[YT_CRAWL] tmdb_id=${r} "${f}" \u2192 ${_?"\uC601\uC5B4":"\uD55C\uAD6D\uC5B4"} \uAC80\uC0C9 \uBAA8\uB4DC (slot=${o?.category_slot||"none"})`);let l=_?{netflix:"Netflix",tving:"Tving",disney:"Disney+",wavve:"Wavve",coupang:"Coupang Play",boxoffice:"Movie"}:{netflix:"\uB137\uD50C\uB9AD\uC2A4",tving:"\uD2F0\uBE59",disney:"\uB514\uC988\uB2C8\uD50C\uB7EC\uC2A4",wavve:"\uC6E8\uC774\uBE0C",coupang:"\uCFE0\uD321\uD50C\uB808\uC774",boxoffice:"\uC601\uD654"},m=o?.platform&&l[o.platform]||"",u=m?`${m} ${s}`:s,{results:E}=await i.DB.prepare("SELECT youtube_id, is_main FROM title_videos WHERE tmdb_id = ?").bind(r).all(),w=new Set(E.map(h=>h.youtube_id)),g=new Set(E.filter(h=>h.is_main===1).map(h=>h.youtube_id));g.size>0&&console.log(`[YT_CRAWL] tmdb_id=${r} \uBA54\uC778 \uC601\uC0C1 ${g.size}\uAC1C \uBCF4\uD638 \uC911`);let y=_?[`${u} official trailer`,`${u} trailer`]:[`${u} \uACF5\uC2DD \uC608\uACE0\uD3B8`,`${u} \uC608\uACE0\uD3B8`],k=s.replace(/[:\-·|]/g," ").replace(/[^\uAC00-\uD7A3a-zA-Z0-9\s]/g,"").split(/\s+/).filter(h=>h.length>=2),R=2,S=[];for(let h of y){if(S.length>=R)break;let b=`https://www.googleapis.com/youtube/v3/search?part=snippet&type=video&order=relevance&maxResults=8&relevanceLanguage=${c}&q=${encodeURIComponent(h)}&key=${i.YOUTUBE_API_KEY}`,N=await fetch(b),T=await N.json();if(!(!N.ok||!T.items?.length))for(let A of T.items){if(S.length>=R)break;let L=A.id?.videoId,C=A.snippet?.title||"";!L||w.has(L)||g.has(L)||O(C)&&(S.push({youtube_id:L,title:C||s,youtube_url:`https://www.youtube.com/watch?v=${L}`}),w.add(L))}}if(!S.length)return console.log(`[YT_CRAWL] tmdb_id=${r} "${u}" \uACB0\uACFC \uC5C6\uC74C (\uAD00\uB828\uC131 \uD544\uD130 \uD1B5\uACFC \uC601\uC0C1 \uC5C6\uC74C)`),0;for(let h of S)await i.DB.prepare(`
        INSERT OR IGNORE INTO title_videos (tmdb_id, youtube_url, youtube_id, title, is_main)
        VALUES (?, ?, ?, ?, 0)
      `).bind(r,h.youtube_url,h.youtube_id,h.title).run();return console.log(`[YT_CRAWL] \u2705 tmdb_id=${r} "${u}" ${S.length}\uAC1C \uC800\uC7A5`),S.length}catch(t){return console.error(`[YT_CRAWL] tmdb_id=${r} \uC624\uB958:`,t.message),0}}async function nt(r,i){return rt(r,i)}async function ot(r,i){let t=await rt(r,i);try{await i.DB.prepare("UPDATE works SET yt_crawl_attempted_at = datetime('now') WHERE tmdb_id = ?").bind(r).run()}catch(f){console.error(`[YT_CRAWL_BATCH] tmdb_id=${r} \uC2DC\uB3C4 \uC2DC\uAC01 \uAE30\uB85D \uC2E4\uD328:`,f.message)}return t}async function dt(r,i){try{let f=(await i.DB.prepare("SELECT media_type FROM works WHERE tmdb_id = ?").bind(r).first())?.media_type||"tv",e=[];try{e=(await(await fetch(`https://api.themoviedb.org/3/${f}/${r}/videos?language=ko-KR&api_key=${i.TMDB_API_KEY}`)).json()).results||[]}catch{}if(!e.length)try{e=(await(await fetch(`https://api.themoviedb.org/3/${f}/${r}/videos?language=en-US&api_key=${i.TMDB_API_KEY}`)).json()).results||[]}catch{}let o=e.filter(p=>p.site==="YouTube"),n=[...o.filter(p=>p.type==="Trailer"||p.type==="Teaser"),...o.filter(p=>p.type!=="Trailer"&&p.type!=="Teaser")];if(!n.length)return console.log(`[TMDB_SAVE] tmdb_id=${r} TMDB \uC601\uC0C1 \uC5C6\uC74C`),0;for(let p=0;p<n.length;p++){let _=n[p],c=p===0?1:0;await i.DB.prepare(`
        INSERT OR IGNORE INTO title_videos (tmdb_id, youtube_url, youtube_id, title, is_main)
        VALUES (?, ?, ?, ?, ?)
      `).bind(r,`https://www.youtube.com/watch?v=${_.key}`,_.key,_.name||"",c).run()}return console.log(`[TMDB_SAVE] \u2705 tmdb_id=${r} ${n.length}\uAC1C \uC800\uC7A5`),n.length}catch(t){return console.error(`[TMDB_SAVE] tmdb_id=${r} \uC624\uB958:`,t.message),0}}async function tt(r,i,t,f){try{console.log(`[REACTION] \uB313\uAE00 \uC218\uC9D1 \uC2DC\uC791: reaction=${r} video=${i}`);let e="https://www.googleapis.com/youtube/v3/commentThreads?part=snippet&videoId="+i+"&maxResults=100&order=relevance&key="+f.YOUTUBE_API_KEY,o=await fetch(e),n=await o.json();if(!o.ok||!n.items?.length){console.error("[REACTION] YouTube API \uC624\uB958:",JSON.stringify(n).slice(0,200));return}let _=n.items.map(u=>{let E=u.snippet.topLevelComment.snippet;return{author:(E.authorDisplayName||"\uC775\uBA85").replace(/^@/,""),text:(E.textDisplay||"").replace(/<[^>]*>/g,"").trim(),likes:E.likeCount||0,published:E.publishedAt||""}}).filter(u=>u.text.length>5).sort((u,E)=>E.likes-u.likes).slice(0,50);if(!_.length)return;let s=`\uC544\uB798\uB294 YouTube \uC601\uC0C1\uC758 \uD574\uC678 \uB313\uAE00 \uBAA9\uB85D\uC785\uB2C8\uB2E4.
\uAC01 \uB313\uAE00\uC744 \uC790\uC5F0\uC2A4\uB7EC\uC6B4 \uD55C\uAD6D\uC5B4\uB85C \uBC88\uC5ED\uD558\uC138\uC694.

\uBC18\uB4DC\uC2DC \uC544\uB798 JSON \uD615\uC2DD\uC73C\uB85C\uB9CC \uC751\uB2F5\uD558\uC138\uC694 (\uB2E4\uB978 \uD14D\uC2A4\uD2B8 \uC5C6\uC774):
[
  {"idx": 0, "translated": "\uBC88\uC5ED\uB41C \uB313\uAE00"},
  ...
]

\uB313\uAE00 \uBAA9\uB85D:
`+_.map((u,E)=>E+1+". "+u.text.slice(0,300)).join(`
`),l=(await(await fetch("https://api.anthropic.com/v1/messages",{method:"POST",headers:{"Content-Type":"application/json","x-api-key":f.ANTHROPIC_API_KEY,"anthropic-version":"2023-06-01"},body:JSON.stringify({model:"claude-haiku-4-5-20251001",max_tokens:4e3,messages:[{role:"user",content:s}]})})).json()).content?.[0]?.text||"[]",m=[];try{let u=l.split("```json").join("").split("```").join("").trim(),E=JSON.parse(u);m=Array.isArray(E)?E:[]}catch{console.error("[REACTION] Claude \uC751\uB2F5 \uD30C\uC2F1 \uC2E4\uD328:",l.slice(0,300)),m=[]}await f.DB.prepare("DELETE FROM reaction_comments WHERE reaction_id = ?").bind(r).run();for(let u=0;u<_.length;u++){let E=_[u],g=(m.find(y=>y.idx===u)||m.find(y=>y.idx===u+1)||m[u]||{}).translated||"";await f.DB.prepare(`
        INSERT INTO reaction_comments
          (reaction_id, tmdb_id, original_text, translated_text, author, like_count, sentiment)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).bind(r,t,E.text.slice(0,1e3),g.slice(0,1e3),E.author.slice(0,100),E.likes,"neutral").run()}console.log(`[REACTION] \u2705 \uC644\uB8CC: reaction=${r} \uB313\uAE00 ${_.length}\uAC1C \uC800\uC7A5`)}catch(e){console.error("[REACTION] \uC624\uB958:",e.message)}}async function lt(r,i,t,f,e,o){if(r.startsWith("/videos/")&&!r.includes("/admin")&&i.method==="GET"){let n=parseInt(r.split("/videos/")[1]);if(!n)return new Response(JSON.stringify({ok:!1,message:"tmdb_id required"}),{status:400,headers:o});try{let{results:p}=await t.DB.prepare("SELECT * FROM title_videos WHERE tmdb_id = ? ORDER BY is_main DESC, created_at DESC").bind(n).all();return p.length===0&&f.waitUntil(dt(n,t)),new Response(JSON.stringify({ok:!0,data:p}),{headers:o})}catch(p){return new Response(JSON.stringify({ok:!1,message:p.message}),{status:500,headers:o})}}if(r==="/admin/videos/crawl"&&i.method==="POST"){if(i.headers.get("Authorization")!==`Bearer ${t.ADMIN_SECRET}`)return new Response(JSON.stringify({ok:!1,message:"Unauthorized"}),{status:401,headers:o});try{let n=await i.json(),{tmdb_id:p}=n;if(!p)return new Response(JSON.stringify({ok:!1,message:"tmdb_id required"}),{status:400,headers:o});let _=await nt(parseInt(p),t);return new Response(JSON.stringify({ok:!0,saved:_}),{headers:o})}catch(n){return new Response(JSON.stringify({ok:!1,message:n.message}),{status:500,headers:o})}}if(r==="/admin/videos/batch-crawl"&&i.method==="POST"){if(i.headers.get("Authorization")!==`Bearer ${t.ADMIN_SECRET}`)return new Response(JSON.stringify({ok:!1,message:"Unauthorized"}),{status:401,headers:o});try{let n=20;try{let g=await i.json();g?.limit&&Number.isInteger(g.limit)&&g.limit>0&&(n=g.limit)}catch{}let p=30,c=(await t.DB.prepare("SELECT COUNT(*) AS cnt FROM works WHERE yt_crawl_attempted_at >= date('now')").first())?.cnt||0;if(c>=p){let g=await t.DB.prepare(`
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
        `).first();return new Response(JSON.stringify({ok:!0,attempted:0,filled:0,remaining:g?.cnt||0,message:`\uC624\uB298 \uC608\uC0B0(${p}\uAC1C) \uC18C\uC9C4 \u2014 \uB0B4\uC77C \uB2E4\uC2DC \uC2DC\uB3C4\uD574\uC8FC\uC138\uC694`}),{headers:o})}let s=Math.min(n,p-c),d=(await t.DB.prepare("SELECT value AS latest_date FROM app_settings WHERE key = 'latest_ranking_date'").first())?.latest_date||null,{results:l}=await t.DB.prepare(`
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
      `).bind(d,s).all();if(!l.length)return new Response(JSON.stringify({ok:!0,attempted:0,filled:0,remaining:0,message:"\uB300\uC0C1 \uC791\uD488 \uC5C6\uC74C (\uBAA8\uB450 \uCFE8\uB2E4\uC6B4 \uC911\uC774\uAC70\uB098 \uC601\uC0C1\uC774 \uC774\uBBF8 \uCDA9\uBD84\uD568)"}),{headers:o});let m=[],u=0;for(let g of l)try{let y=await ot(g.tmdb_id,t);u+=y,m.push({tmdb_id:g.tmdb_id,saved:y,ok:!0})}catch(y){console.error(`[BATCH_CRAWL] tmdb_id=${g.tmdb_id} \uC624\uB958:`,y.message),m.push({tmdb_id:g.tmdb_id,saved:0,ok:!1,error:y.message})}let w=(await t.DB.prepare(`
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
      `).first())?.cnt||0;return console.log(`[BATCH_CRAWL] \u2705 \uC644\uB8CC: \uC2DC\uB3C4 ${l.length}\uAC74, \uC800\uC7A5 ${u}\uAC1C, \uB0A8\uC74C ${w}`),new Response(JSON.stringify({ok:!0,attempted:l.length,filled:u,remaining:w,results:m}),{headers:o})}catch(n){return new Response(JSON.stringify({ok:!1,message:n.message}),{status:500,headers:o})}}if(r==="/admin/videos"&&i.method==="POST"){if(i.headers.get("Authorization")!==`Bearer ${t.ADMIN_SECRET}`)return new Response(JSON.stringify({ok:!1,message:"Unauthorized"}),{status:401,headers:o});try{let n=await i.json(),{tmdb_id:p,youtube_url:_}=n,{title:c}=n;if(!p||!_)return new Response(JSON.stringify({ok:!1,message:"tmdb_id, youtube_url required"}),{status:400,headers:o});let s=_.match(/(?:v=|youtu\.be\/|embed\/)([a-zA-Z0-9_-]{11})/);if(!s)return new Response(JSON.stringify({ok:!1,message:"\uC720\uD6A8\uD558\uC9C0 \uC54A\uC740 \uC720\uD29C\uBE0C URL"}),{status:400,headers:o});let a=s[1],d=await t.DB.prepare("SELECT id, title FROM title_videos WHERE tmdb_id = ? AND youtube_id = ? LIMIT 1").bind(p,a).first();if(d)return new Response(JSON.stringify({ok:!1,message:`\uC774\uBBF8 \uB4F1\uB85D\uB41C \uC601\uC0C1\uC785\uB2C8\uB2E4. (\uC81C\uBAA9: "${d.title||a}")`}),{status:409,headers:o});if(!c)try{c=(await(await fetch(`https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${a}&format=json`)).json()).title||""}catch{c=""}return await t.DB.prepare("INSERT INTO title_videos (tmdb_id, youtube_url, youtube_id, title, is_main) VALUES (?, ?, ?, ?, 0)").bind(p,_,a,c).run(),new Response(JSON.stringify({ok:!0}),{headers:o})}catch(n){return new Response(JSON.stringify({ok:!1,message:n.message}),{status:500,headers:o})}}if(r.match(/\/admin\/videos\/(\d+)\/main/)&&i.method==="PATCH"){if(i.headers.get("Authorization")!==`Bearer ${t.ADMIN_SECRET}`)return new Response(JSON.stringify({ok:!1,message:"Unauthorized"}),{status:401,headers:o});let n=parseInt(r.match(/\/admin\/videos\/(\d+)\/main/)[1]);try{let{results:p}=await t.DB.prepare("SELECT tmdb_id FROM title_videos WHERE id = ?").bind(n).all();if(!p.length)return new Response(JSON.stringify({ok:!1,message:"\uC5C6\uC74C"}),{status:404,headers:o});let _=p[0].tmdb_id;return await t.DB.batch([t.DB.prepare("UPDATE title_videos SET is_main = 0 WHERE tmdb_id = ?").bind(_),t.DB.prepare("UPDATE title_videos SET is_main = 1 WHERE id = ?").bind(n)]),new Response(JSON.stringify({ok:!0}),{headers:o})}catch(p){return new Response(JSON.stringify({ok:!1,message:p.message}),{status:500,headers:o})}}if(r.match(/\/admin\/videos\/(\d+)$/)&&i.method==="DELETE"){if(i.headers.get("Authorization")!==`Bearer ${t.ADMIN_SECRET}`)return new Response(JSON.stringify({ok:!1,message:"Unauthorized"}),{status:401,headers:o});let n=parseInt(r.match(/\/admin\/videos\/(\d+)$/)[1]);try{return await t.DB.prepare("DELETE FROM title_videos WHERE id = ?").bind(n).run(),new Response(JSON.stringify({ok:!0}),{headers:o})}catch(p){return new Response(JSON.stringify({ok:!1,message:p.message}),{status:500,headers:o})}}if(r.startsWith("/imdb/")&&r!=="/imdb/save"&&i.method==="GET"){let n=r.split("/imdb/")[1];if(!n||!/^tt\d+$/.test(n))return new Response(JSON.stringify({ok:!1,message:"invalid imdb_id"}),{status:400,headers:o});try{let p=await t.DB.prepare("SELECT imdb_rating, imdb_votes, imdb_updated FROM works WHERE imdb_id = ? LIMIT 1").bind(n).first();if(p?.imdb_rating){let a=new Date(p.imdb_updated||0);if((Date.now()-a.getTime())/(1e3*60*60*24)<7)return new Response(JSON.stringify({ok:!0,source:"cache",rating:p.imdb_rating.toFixed(1),votes:p.imdb_votes||""}),{headers:o})}let _=t.OMDB_API_KEY;if(!_)return new Response(JSON.stringify({ok:!1,message:"OMDB key not configured"}),{status:500,headers:o});let s=await(await fetch(`https://www.omdbapi.com/?i=${n}&apikey=${_}`)).json();if(s.Response!=="False"){let a=parseFloat(s.imdbRating);if(!isNaN(a)){let d=s.imdbVotes||"",l=new Date().toISOString();return await t.DB.prepare("UPDATE works SET imdb_rating = ?, imdb_votes = ?, imdb_updated = ? WHERE imdb_id = ?").bind(a,d,l,n).run(),new Response(JSON.stringify({ok:!0,source:"omdb",rating:a.toFixed(1),votes:d}),{headers:o})}}return new Response(JSON.stringify({ok:!1,message:"rating not available"}),{status:404,headers:o})}catch(p){return console.error("[IMDB GET]",p),new Response(JSON.stringify({ok:!1,message:p.message}),{status:500,headers:o})}}if(r==="/imdb/save"&&i.method==="POST")try{let n=await i.json(),{tmdb_id:p,imdb_id:_}=n;return!p||!_?new Response(JSON.stringify({ok:!1,message:"tmdb_id and imdb_id required"}),{status:400,headers:o}):/^tt\d+$/.test(_)?(await t.DB.prepare("UPDATE works SET imdb_id = ? WHERE tmdb_id = ?").bind(_,parseInt(p)).run(),new Response(JSON.stringify({ok:!0}),{headers:o})):new Response(JSON.stringify({ok:!1,message:"invalid imdb_id format"}),{status:400,headers:o})}catch(n){return console.error("[IMDB SAVE]",n),new Response(JSON.stringify({ok:!1,message:n.message}),{status:500,headers:o})}if(r==="/youtube/trending"&&i.method==="GET")try{let{results:n}=await t.DB.prepare("SELECT * FROM youtube_trending ORDER BY rank ASC").all();if(n.length>0){let l=new Date(n[0].collected_at);if((Date.now()-l.getTime())/(1e3*60*60)<6)return new Response(JSON.stringify({ok:!0,data:n,cached:!0}),{headers:o})}let p=`https://www.googleapis.com/youtube/v3/videos?part=snippet,statistics&chart=mostPopular&regionCode=KR&maxResults=50&key=${t.YOUTUBE_API_KEY}`,_=await fetch(p),c=await _.json();if(!_.ok||!c.items?.length)return n.length>0?new Response(JSON.stringify({ok:!0,data:n,cached:!0}),{headers:o}):new Response(JSON.stringify({ok:!1,message:"YouTube API \uC624\uB958"}),{status:500,headers:o});let s=new Date().toISOString(),a=c.items.map((l,m)=>({rank:m+1,video_id:l.id,title:l.snippet?.title||"",channel:l.snippet?.channelTitle||"",thumbnail:l.snippet?.thumbnails?.medium?.url||l.snippet?.thumbnails?.default?.url||"",view_count:parseInt(l.statistics?.viewCount||0),collected_at:s}));await t.DB.prepare("DELETE FROM youtube_trending").run();let d=a.map(l=>t.DB.prepare(`
          INSERT INTO youtube_trending (rank, video_id, title, channel, thumbnail, view_count, collected_at)
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `).bind(l.rank,l.video_id,l.title,l.channel,l.thumbnail,l.view_count,l.collected_at));return await t.DB.batch(d),new Response(JSON.stringify({ok:!0,data:a,cached:!1}),{headers:o})}catch(n){return new Response(JSON.stringify({ok:!1,message:n.message}),{status:500,headers:o})}if(r==="/works/register"&&i.method==="POST")try{let n=await i.json(),{tmdb_id:p,title_ko:_,title_en:c,poster_path:s,media_type:a,genre:d,original_language:l,tmdb_rating:m,release_date:u}=n;if(!p||!_)return new Response(JSON.stringify({ok:!1,message:"tmdb_id, title_ko required"}),{status:400,headers:o});let E=c&&/[\uAC00-\uD7A3]/.test(c),g=c&&/[a-zA-Z]/.test(c)&&!E?c:null,y=m??null,k=u||null,O=new Date().toISOString(),R=await t.DB.prepare("SELECT tmdb_id FROM works WHERE tmdb_id = ?").bind(parseInt(p)).first(),S=null,h=null,b=a||null;if(!R){let N=a?[a]:["movie","tv"],T=!1;for(let W of N)try{let U=await fetch(`https://api.themoviedb.org/3/${W}/${parseInt(p)}/keywords?api_key=${t.TMDB_API_KEY}`);if(!U.ok)continue;T=!0;let j=await U.json(),z=j.keywords||j.results||[];if(z.length){S=z.map(V=>V.name).filter(Boolean).join(",");break}}catch{}let A=S&&S.split(",").includes("softcore"),L=T&&!S,I=/[\u3040-\u309F\u30A0-\u30FF]/.test(_||"")&&_.length>=20,F=/\bNTR\b/.test(_||"")||(_||"").includes("\u4E2D\u51FA\u3057")||(_||"").includes("\u624B\u30B3\u30AD"),M=!!(S&&["creampie","orgy","gang rape","netorare","cuckold","big tits","handjob"].some(W=>S.includes(W)));I||F||M?(h=2,b="movie"):(A||L)&&(h=1,b="movie")}return await t.DB.prepare(`
        INSERT INTO works (
          tmdb_id, title_ko, title_en, poster_path, media_type, genre, original_language,
          tmdb_rating, release_date, rating_updated_at, match_source, keywords, adult_flag
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'user', ?, ?)
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
      `).bind(parseInt(p),_||null,g||null,s||null,b,d||null,l||null,y,k,O,S,h).run(),new Response(JSON.stringify({ok:!0}),{headers:o})}catch(n){return new Response(JSON.stringify({ok:!1,message:n.message}),{status:500,headers:o})}if(r.startsWith("/works/variety-similar/")&&i.method==="GET"){let n=parseInt(r.split("/works/variety-similar/")[1]);if(!n)return new Response(JSON.stringify({ok:!1,message:"tmdb_id required"}),{status:400,headers:o});let p=Math.min(parseInt(e.searchParams.get("limit")||"10"),20);try{let c=((await t.DB.prepare("SELECT variety_genre FROM works WHERE tmdb_id = ?").bind(n).first())?.variety_genre||"").split(",").map(l=>l.trim()).filter(Boolean);if(!c.length)return new Response(JSON.stringify({ok:!0,data:[]}),{headers:o});let{results:s}=await t.DB.prepare(`
        SELECT tmdb_id, title_ko, title_en, poster_path, tmdb_rating, release_year, variety_genre, media_type
        FROM works
        WHERE variety_genre IS NOT NULL AND variety_genre != '' AND tmdb_id != ?
      `).bind(n).all(),a=new Map;try{let l=await t.DB.prepare("SELECT value as d FROM app_settings WHERE key = 'latest_ranking_date'").first();if(l?.d){let{results:m}=await t.DB.prepare(`
            SELECT tmdb_id, COUNT(DISTINCT platform) as cnt
            FROM rankings
            WHERE date = ?
            GROUP BY tmdb_id
          `).bind(l.d).all();for(let u of m)a.set(u.tmdb_id,u.cnt)}}catch{}let d=[];for(let l of s){let m=(l.variety_genre||"").split(",").map(y=>y.trim()).filter(Boolean),u=c.filter(y=>m.includes(y)).length;if(!u)continue;let E=null;if(c.length===2?E=u===2?92:82:c.length===1&&(E=u===1?87:null),!E)continue;let w=a.get(l.tmdb_id)||0,g=Math.min(E+w,99);d.push({tmdb_id:l.tmdb_id,title_ko:l.title_ko,title_en:l.title_en,poster_path:l.poster_path,tmdb_rating:l.tmdb_rating,release_year:l.release_year,match_pct:g,media_type:l.media_type||null})}return d.sort((l,m)=>m.match_pct-l.match_pct||(m.release_year||0)-(l.release_year||0)||(m.tmdb_rating||0)-(l.tmdb_rating||0)),new Response(JSON.stringify({ok:!0,data:d.slice(0,p)}),{headers:o})}catch(_){return new Response(JSON.stringify({ok:!1,message:_.message}),{status:500,headers:o})}}if(r.startsWith("/works/")&&i.method==="GET"){let n=r.split("/works/")[1];if(!n)return new Response(JSON.stringify({ok:!1,message:"tmdb_id required"}),{status:400,headers:o});let{results:p}=await t.DB.prepare("SELECT * FROM works WHERE tmdb_id = ?").bind(parseInt(n)).all();if(!p.length)return new Response(JSON.stringify({ok:!1,message:"Not found"}),{status:404,headers:o});let _={...p[0]};if(!_.mbti_tags&&_.genre){let u=zt(_.genre);u&&(f.waitUntil(t.DB.prepare("UPDATE works SET mbti_tags = ? WHERE tmdb_id = ?").bind(u,parseInt(n)).run()),_.mbti_tags=u)}let c=7200*60*1e3,s=2400*60*60*1e3,a=!1;try{let{results:u}=await t.DB.prepare(`
        SELECT 1 FROM rankings
        WHERE tmdb_id = ? AND date = (SELECT value FROM app_settings WHERE key = 'latest_ranking_date')
        LIMIT 1
      `).bind(parseInt(n)).all();a=!!(u&&u.length)}catch{a=!1}let d=a?c:s;if(!_.keyword_preview_updated_at||Date.now()-new Date(_.keyword_preview_updated_at).getTime()>d){let u={keyword:null,items:[]};if(_.keywords&&_.keywords!=="__NONE__"){let w=_.keywords.split(",").map(g=>g.trim()).filter(Boolean).slice(0,10);if(w.length)try{let g=w.map(k=>t.DB.prepare(`
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
              `).bind(k.toLowerCase(),parseInt(n))),y=await t.DB.batch(g);for(let k=0;k<w.length;k++){let O=y[k]?.results||[];if(O.length>=3){u={keyword:w[k],items:O};break}}}catch{}}let E=new Date().toISOString();_.keyword_preview=JSON.stringify(u),_.keyword_preview_updated_at=E,f.waitUntil(t.DB.prepare("UPDATE works SET keyword_preview = ?, keyword_preview_updated_at = ? WHERE tmdb_id = ?").bind(_.keyword_preview,E,parseInt(n)).run())}try{let{results:u}=await t.DB.prepare(`
        SELECT w.tmdb_id, w.title_ko, w.title_en, w.poster_path, w.release_year, w.media_type, p.pinned_pct
        FROM work_pinned_similar p
        JOIN works w ON w.tmdb_id = p.related_tmdb_id
        WHERE p.tmdb_id = ?
        ORDER BY p.pinned_pct DESC
      `).bind(parseInt(n)).all();_.pinned_similar=u||[]}catch{_.pinned_similar=[]}if(!_.keyword_ko_map_updated_at||Date.now()-new Date(_.keyword_ko_map_updated_at).getTime()>d){let u={},E=!1;if(_.keywords&&_.keywords!=="__NONE__"){let w=_.keywords.split(",").map(g=>g.trim().toLowerCase()).filter(Boolean);if(w.length)try{let g=w.map(()=>"?").join(","),{results:y}=await t.DB.prepare(`SELECT keyword_en, keyword_ko FROM keyword_translation WHERE keyword_en IN (${g}) AND source = 'admin'`).bind(...w).all();for(let k of y||[])u[k.keyword_en]=k.keyword_ko}catch{E=!0}}if(_.keyword_ko_map=u,!E){let w=new Date().toISOString();f.waitUntil(t.DB.prepare("UPDATE works SET keyword_ko_map = ?, keyword_ko_map_updated_at = ? WHERE tmdb_id = ?").bind(JSON.stringify(u),w,parseInt(n)).run())}}else try{_.keyword_ko_map=_.keyword_ko_map?JSON.parse(_.keyword_ko_map):{}}catch{_.keyword_ko_map={}}return new Response(JSON.stringify({ok:!0,data:_}),{headers:o})}if(r==="/search/keyword"&&i.method==="GET"){let n=(e.searchParams.get("keyword")||"").trim().toLowerCase(),p=Math.min(parseInt(e.searchParams.get("limit")||"20"),40);if(!n)return new Response(JSON.stringify({ok:!1,message:"keyword required"}),{status:400,headers:o});try{let{results:_}=await t.DB.prepare(`
        SELECT w.tmdb_id, w.title_ko, w.title_en, w.poster_path, w.genre, w.tmdb_rating, w.media_type, w.original_language
        FROM work_keywords wk
        JOIN works w ON w.tmdb_id = wk.tmdb_id
        WHERE wk.keyword = ?
          AND (w.adult_flag IS NULL OR w.adult_flag != 1)
        ORDER BY
          CASE WHEN w.original_language = 'ko' THEN 0 ELSE 1 END,
          w.tmdb_rating DESC
        LIMIT ?
      `).bind(n,p).all();return new Response(JSON.stringify({ok:!0,keyword:n,data:_}),{headers:o})}catch(_){return new Response(JSON.stringify({ok:!1,message:_.message}),{status:500,headers:o})}}return null}function zt(r){if(!r)return null;let i=new Set(["Reality","Talk","News","Soap","Documentary","Kids","\uB2E4\uD050\uBA58\uD130\uB9AC","\uB9AC\uC5BC\uB9AC\uD2F0"]),t=r.split(",").map(s=>s.trim()).filter(Boolean);if(!t.length||!t.filter(s=>!i.has(s)).length)return null;let e=s=>s===0?5:s===1?3:s===2?2:1,o={INTJ:{primary:["Science Fiction","Sci-Fi & Fantasy","SF"],secondary:["Drama","\uB4DC\uB77C\uB9C8","Thriller","\uC2A4\uB9B4\uB7EC"]},INTP:{primary:["Science Fiction","Sci-Fi & Fantasy","SF"],secondary:["Thriller","Mystery","\uC2A4\uB9B4\uB7EC","\uBBF8\uC2A4\uD130\uB9AC"]},ENTJ:{primary:["Drama","\uB4DC\uB77C\uB9C8"],secondary:["Science Fiction","Sci-Fi & Fantasy","SF"]},ENTP:{primary:["Science Fiction","Sci-Fi & Fantasy","SF"],secondary:["Action","Action & Adventure","\uC561\uC158","Adventure","\uBAA8\uD5D8"]},INFJ:{primary:["Thriller","Mystery","\uC2A4\uB9B4\uB7EC","\uBBF8\uC2A4\uD130\uB9AC"],secondary:["Drama","\uB4DC\uB77C\uB9C8","Crime","\uBC94\uC8C4"]},INFP:{primary:["Fantasy","Sci-Fi & Fantasy","\uD310\uD0C0\uC9C0"],secondary:["Drama","\uB4DC\uB77C\uB9C8","Animation","\uC560\uB2C8\uBA54\uC774\uC158"]},ENFJ:{primary:["Fantasy","Sci-Fi & Fantasy","\uD310\uD0C0\uC9C0"],secondary:["Drama","\uB4DC\uB77C\uB9C8","Family","\uAC00\uC871"]},ENFP:{primary:["Drama","\uB4DC\uB77C\uB9C8"],secondary:["Comedy","\uCF54\uBBF8\uB514","Fantasy","\uD310\uD0C0\uC9C0"]},ISTJ:{primary:["Drama","\uB4DC\uB77C\uB9C8"],secondary:["Action","Action & Adventure","\uC561\uC158","History","\uC5ED\uC0AC","War","War & Politics","\uC804\uC7C1"]},ISFJ:{primary:["Comedy","\uCF54\uBBF8\uB514"],secondary:["Romance","\uB85C\uB9E8\uC2A4","Family","\uAC00\uC871","Drama","\uB4DC\uB77C\uB9C8"]},ESTJ:{primary:["Action","Action & Adventure","\uC561\uC158"],secondary:["Drama","\uB4DC\uB77C\uB9C8","History","\uC5ED\uC0AC","War","War & Politics","\uC804\uC7C1"]},ESFJ:{primary:["Action","Action & Adventure","\uC561\uC158"],secondary:["Comedy","\uCF54\uBBF8\uB514","Family","\uAC00\uC871","Romance","\uB85C\uB9E8\uC2A4"]},ISTP:{primary:["Horror","Thriller","\uACF5\uD3EC","\uC2A4\uB9B4\uB7EC"],secondary:["Action","Action & Adventure","\uC561\uC158","Crime","\uBC94\uC8C4"]},ISFP:{primary:["Drama","\uB4DC\uB77C\uB9C8"],secondary:["Animation","\uC560\uB2C8\uBA54\uC774\uC158","Romance","\uB85C\uB9E8\uC2A4","Music","\uC74C\uC545"]},ESTP:{primary:["Action","Action & Adventure","\uC561\uC158"],secondary:["Thriller","Mystery","Crime","\uC2A4\uB9B4\uB7EC","\uBBF8\uC2A4\uD130\uB9AC","\uBC94\uC8C4"]},ESFP:{primary:["Comedy","\uCF54\uBBF8\uB514"],secondary:["Action","Action & Adventure","\uC561\uC158","Romance","\uB85C\uB9E8\uC2A4"]}},n={};for(let[s,a]of Object.entries(o)){let d=0;t.forEach((l,m)=>{let u=e(m);a.primary.includes(l)?d+=u*3:a.secondary.includes(l)&&(d+=u*1)}),d>0&&(n[s]=d)}if(!Object.keys(n).length)return null;let p=parseInt(r.split("").reduce((s,a)=>s+a.charCodeAt(0),0)),_=s=>{let a=Math.sin(p+s*127)*43758.5453;return a-Math.floor(a)},c=Object.entries(n);return c.sort((s,a)=>{if(a[1]!==s[1])return a[1]-s[1];let d=c.indexOf(s),l=c.indexOf(a);return _(d)-_(l)}),c.slice(0,5).map(([s])=>s).join(",")}function Kt(r){let i=r.trim().split(/\s+/).filter(Boolean);return i.length?i.map(t=>`"${t.replace(/"/g,'""')}"*`).join(" "):null}function ct(r,i,t){let f=Kt(i);return[f?r.DB.prepare(`
        SELECT w.tmdb_id FROM works_fts f
        JOIN works w ON w.id = f.rowid
        WHERE works_fts MATCH ?
        LIMIT ?
      `).bind(f,t):r.DB.prepare("SELECT tmdb_id FROM works WHERE 0 LIMIT 0"),r.DB.prepare(`
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
        AND (adult_flag IS NULL OR adult_flag NOT IN (1, 2))
        AND poster_path IS NOT NULL AND poster_path != ''
      ORDER BY (original_language = 'ko') DESC, tmdb_rating DESC
      LIMIT ?
    `).bind(i,t)]}async function Gt(r,i,t,f){let o=i.flatMap(s=>ct(r,s,30)),n=await r.DB.batch(o),p=new Set;n.forEach(s=>(s.results||[]).forEach(a=>p.add(a.tmdb_id)));let _=[...p].filter(s=>!t.has(s)),c=[];if(_.length){let s=_.map(()=>"?").join(",");c=(await r.DB.prepare(`
      SELECT tmdb_id, title_ko, title_en, poster_path, media_type, release_year, tmdb_rating, original_language
      FROM works
      WHERE tmdb_id IN (${s})
        AND (adult_flag IS NULL OR adult_flag NOT IN (1, 2))
        AND poster_path IS NOT NULL AND poster_path != ''
    `).bind(..._).all()).results}return c.sort((s,a)=>{let d=s.original_language==="ko"?0:1,l=a.original_language==="ko"?0:1;return d!==l?d-l:(a.tmdb_rating||0)-(s.tmdb_rating||0)}),c.slice(0,f)}async function _t(r,i,t,f,e){if(r==="/works/search"&&i.method==="GET"){let o=f.searchParams.get("q")||"",n=Math.min(parseInt(f.searchParams.get("limit")||"15"),30),p=Math.max(parseInt(f.searchParams.get("offset")||"0"),0),_=["netflix","tving","disney","coupang","wavve","watcha"],c=f.searchParams.get("ott")||"",s=_.includes(c)?c:"",a=100,d=15,l=24;if(!o.trim())return new Response(JSON.stringify({ok:!1,message:"q required"}),{status:400,headers:e});try{let[m,u,E]=await t.DB.batch(ct(t,o,a)),w=new Map;if(m.results.forEach(b=>w.set(b.tmdb_id,0)),u.results.forEach(b=>{w.has(b.tmdb_id)||w.set(b.tmdb_id,1)}),E.results.forEach(b=>{w.has(b.tmdb_id)||w.set(b.tmdb_id,2)}),w.size===0){let b=o.replace(/\s+/g,""),{results:N}=await t.DB.prepare(`
          SELECT tmdb_id FROM works
          WHERE REPLACE(title_ko, ' ', '') LIKE ? OR REPLACE(title_en, ' ', '') LIKE ?
          LIMIT ?
        `).bind(`%${b}%`,`%${b}%`,a).all();N.forEach(T=>w.set(T.tmdb_id,3))}let g=w.size>a,y=[...w.keys()].slice(0,a);if(s&&y.length){let{results:b}=await t.DB.prepare(`
          SELECT tmdb_id FROM work_ott WHERE ott_key = ?
        `).bind(s).all(),N=new Set(b.map(T=>T.tmdb_id));y=y.filter(T=>N.has(T))}let k=[];if(y.length){let b=y.map(()=>"?").join(",");k=(await t.DB.prepare(`
          SELECT tmdb_id, title_ko, title_en, poster_path, media_type, release_year, tmdb_rating, original_language
          FROM works
          WHERE tmdb_id IN (${b})
            AND (adult_flag IS NULL OR adult_flag NOT IN (1, 2))
            AND poster_path IS NOT NULL AND poster_path != ''
        `).bind(...y).all()).results}if(!s&&k.length<d){let b=[...new Set(o.split(/\s+/).filter(N=>N.length>=2))].slice(0,3);b.length>=2&&(await Gt(t,b,new Set(w.keys()),l)).forEach(T=>{w.set(T.tmdb_id,4),k.push(T)})}let O=k.length;k.sort((b,N)=>{let T=w.get(b.tmdb_id)??1,A=w.get(N.tmdb_id)??1;if(T!==A)return T-A;let L=b.original_language==="ko"?0:1,C=N.original_language==="ko"?0:1;return L!==C?L-C:(N.tmdb_rating||0)-(b.tmdb_rating||0)});let R=k.slice(p,p+n),S=k.length>p+n,h=[];if(R.length){let b=R.map(I=>I.tmdb_id),N=b.map(()=>"?").join(","),[{results:T},{results:A}]=await Promise.all([t.DB.prepare(`
            SELECT tmdb_id, platform, rank
            FROM rankings
            WHERE tmdb_id IN (${N})
              AND date = (SELECT value FROM app_settings WHERE key = 'latest_ranking_date')
              AND NOT (platform = 'netflix' AND category_slot = 'category10')
          `).bind(...b).all(),t.DB.prepare(`
            SELECT tmdb_id, ott_key FROM work_ott
            WHERE tmdb_id IN (${N})
          `).bind(...b).all()]),L={};T.forEach(I=>{L[I.tmdb_id]||(L[I.tmdb_id]={}),L[I.tmdb_id][I.platform]=I.rank});let C={};A.forEach(I=>{(C[I.tmdb_id]||=[]).push(I.ott_key)}),h=R.map(I=>({...I,ott_ranks:L[I.tmdb_id]||{},ott_keys:C[I.tmdb_id]||[]}))}return new Response(JSON.stringify({ok:!0,data:h,has_more:S,limit:n,offset:p,total:O,capped:g,all_ids:k.map(b=>b.tmdb_id),match_types:Object.fromEntries(w)}),{headers:e})}catch(m){return new Response(JSON.stringify({ok:!1,message:m.message}),{status:500,headers:e})}}if(r==="/works/exists"&&i.method==="GET"){let n=(f.searchParams.get("ids")||"").split(",").map(p=>parseInt(p.trim())).filter(p=>Number.isInteger(p)).slice(0,100);if(!n.length)return new Response(JSON.stringify({ok:!0,existing_ids:[]}),{headers:e});try{let p=n.map(()=>"?").join(","),{results:_}=await t.DB.prepare(`
        SELECT tmdb_id FROM works WHERE tmdb_id IN (${p})
      `).bind(...n).all();return new Response(JSON.stringify({ok:!0,existing_ids:_.map(c=>c.tmdb_id)}),{headers:e})}catch(p){return new Response(JSON.stringify({ok:!1,message:p.message}),{status:500,headers:e})}}if(r==="/works/ott-map"&&i.method==="GET"){let n=(f.searchParams.get("tmdb_ids")||"").split(",").map(p=>parseInt(p.trim())).filter(p=>Number.isInteger(p)).slice(0,100);if(!n.length)return new Response(JSON.stringify({ok:!0,map:{}}),{headers:e});try{let p=n.map(()=>"?").join(","),{results:_}=await t.DB.prepare(`
        SELECT tmdb_id, ott_key FROM work_ott WHERE tmdb_id IN (${p})
      `).bind(...n).all(),c={};return _.forEach(s=>{(c[s.tmdb_id]||=[]).push(s.ott_key)}),new Response(JSON.stringify({ok:!0,map:c}),{headers:e})}catch(p){return new Response(JSON.stringify({ok:!1,message:p.message}),{status:500,headers:e})}}if(r==="/works/details"&&i.method==="GET"){let n=(f.searchParams.get("tmdb_ids")||"").split(",").map(p=>parseInt(p.trim())).filter(p=>Number.isInteger(p)).slice(0,100);if(!n.length)return new Response(JSON.stringify({ok:!0,data:[]}),{headers:e});try{let p=n.map(()=>"?").join(","),{results:_}=await t.DB.prepare(`
        SELECT tmdb_id, title_ko, title_en, poster_path, media_type, release_year, tmdb_rating, original_language
        FROM works
        WHERE tmdb_id IN (${p})
          AND (adult_flag IS NULL OR adult_flag NOT IN (1, 2))
          AND poster_path IS NOT NULL AND poster_path != ''
      `).bind(...n).all(),c=[];if(_.length){let s=_.map(E=>E.tmdb_id),a=s.map(()=>"?").join(","),[{results:d},{results:l}]=await Promise.all([t.DB.prepare(`
            SELECT tmdb_id, platform, rank
            FROM rankings
            WHERE tmdb_id IN (${a})
              AND date = (SELECT value FROM app_settings WHERE key = 'latest_ranking_date')
              AND NOT (platform = 'netflix' AND category_slot = 'category10')
          `).bind(...s).all(),t.DB.prepare(`
            SELECT tmdb_id, ott_key FROM work_ott WHERE tmdb_id IN (${a})
          `).bind(...s).all()]),m={};d.forEach(E=>{m[E.tmdb_id]||(m[E.tmdb_id]={}),m[E.tmdb_id][E.platform]=E.rank});let u={};l.forEach(E=>{(u[E.tmdb_id]||=[]).push(E.ott_key)}),c=_.map(E=>({...E,ott_ranks:m[E.tmdb_id]||{},ott_keys:u[E.tmdb_id]||[]}))}return new Response(JSON.stringify({ok:!0,data:c}),{headers:e})}catch(p){return new Response(JSON.stringify({ok:!1,message:p.message}),{status:500,headers:e})}}if(r==="/search-log"&&i.method==="POST")try{let o=await i.json().catch(()=>({})),n=(o.q||"").toString().trim().slice(0,200),p=parseInt(o.total,10)||0,_=o.totalCount,c=_==null?null:String(_).slice(0,20);return n?(await t.DB.prepare("INSERT INTO search_logs (query, result_count, total_count) VALUES (?, ?, ?)").bind(n,p,c).run(),new Response(JSON.stringify({ok:!0}),{headers:e})):new Response(JSON.stringify({ok:!0}),{headers:e})}catch(o){return new Response(JSON.stringify({ok:!1,message:o.message}),{status:500,headers:e})}return null}async function pt(r,i,t,f,e){if(r==="/reactions"&&i.method==="GET"){let o=new URL(i.url),n=o.searchParams.get("tmdb_id"),p=o.searchParams.get("featured"),_=parseInt(o.searchParams.get("page")||"1"),c=20,s=(_-1)*c,a,d;p==="1"?(a="SELECT * FROM reactions WHERE is_featured = 1 ORDER BY created_at DESC LIMIT 1",d=[]):n?(a="SELECT * FROM reactions WHERE tmdb_id = ? ORDER BY is_featured DESC, like_count DESC, created_at DESC",d=[parseInt(n)]):(a="SELECT * FROM reactions ORDER BY is_featured DESC, created_at DESC LIMIT ? OFFSET ?",d=[c,s]);let{results:l}=d.length?await t.DB.prepare(a).bind(...d).all():await t.DB.prepare(a).all();return new Response(JSON.stringify({ok:!0,data:l}),{headers:e})}if(r.match(/^\/reactions\/work\/\d+$/)&&i.method==="GET")try{let o=parseInt(r.split("/")[3]),n=["great","good","meh","bad"],{results:p}=await t.DB.prepare(`
        SELECT reaction, COUNT(*) as cnt
        FROM work_reactions
        WHERE tmdb_id = ?
        GROUP BY reaction
      `).bind(o).all(),_=p.reduce((l,m)=>l+m.cnt,0),c={};n.forEach(l=>c[l]=0),p.forEach(l=>{n.includes(l.reaction)&&(c[l.reaction]=l.cnt)});let s={};if(_>0){let l=0,m=n.map(u=>({k:u,raw:c[u]/_*100}));m.forEach((u,E)=>{E<m.length-1?(s[u.k]=Math.round(u.raw),l+=s[u.k]):s[u.k]=100-l})}else n.forEach(l=>s[l]=0);let a=null,d=i.headers.get("Authorization")?.replace("Bearer ","")||(()=>{let m=(i.headers.get("Cookie")||"").match(/session=([^;]+)/);return m?m[1]:null})();if(d){let l=await t.DB.prepare("SELECT user_id FROM sessions WHERE id = ? AND expires_at > datetime('now') LIMIT 1").bind(d).first();l?.user_id&&(a=(await t.DB.prepare("SELECT reaction FROM work_reactions WHERE tmdb_id = ? AND user_id = ? LIMIT 1").bind(o,l.user_id).first())?.reaction||null)}return new Response(JSON.stringify({ok:!0,data:{total:_,counts:c,ratios:s,my_reaction:a}}),{headers:e})}catch(o){return new Response(JSON.stringify({ok:!1,message:o.message}),{status:500,headers:e})}if(r==="/reactions/work"&&i.method==="POST")try{let o=i.headers.get("Authorization")?.replace("Bearer ","")||(()=>{let y=(i.headers.get("Cookie")||"").match(/session=([^;]+)/);return y?y[1]:null})();if(!o)return new Response(JSON.stringify({ok:!1,message:"\uB85C\uADF8\uC778\uC774 \uD544\uC694\uD569\uB2C8\uB2E4"}),{status:401,headers:e});let n=await t.DB.prepare("SELECT user_id FROM sessions WHERE id = ? AND expires_at > datetime('now') LIMIT 1").bind(o).first();if(!n?.user_id)return new Response(JSON.stringify({ok:!1,message:"\uC138\uC158\uC774 \uB9CC\uB8CC\uB410\uC2B5\uB2C8\uB2E4"}),{status:401,headers:e});let p=await i.json(),{tmdb_id:_,reaction:c}=p,s=["great","good","meh","bad"];if(!_||!s.includes(c))return new Response(JSON.stringify({ok:!1,message:"\uC62C\uBC14\uB974\uC9C0 \uC54A\uC740 \uC694\uCCAD\uC785\uB2C8\uB2E4"}),{status:400,headers:e});let a=n.user_id;await t.DB.prepare(`
        INSERT INTO work_reactions (tmdb_id, user_id, reaction, updated_at)
        VALUES (?, ?, ?, datetime('now'))
        ON CONFLICT(tmdb_id, user_id)
        DO UPDATE SET reaction = excluded.reaction, updated_at = datetime('now')
      `).bind(parseInt(_),a,c).run();let{results:d}=await t.DB.prepare(`
        SELECT reaction, COUNT(*) as cnt
        FROM work_reactions
        WHERE tmdb_id = ?
        GROUP BY reaction
      `).bind(parseInt(_)).all(),l=d.reduce((g,y)=>g+y.cnt,0),m={};s.forEach(g=>m[g]=0),d.forEach(g=>{s.includes(g.reaction)&&(m[g.reaction]=g.cnt)});let u={},E=0,w=s.map(g=>({k:g,raw:m[g]/l*100}));return w.forEach((g,y)=>{y<w.length-1?(u[g.k]=Math.round(g.raw),E+=u[g.k]):u[g.k]=100-E}),new Response(JSON.stringify({ok:!0,data:{total:l,counts:m,ratios:u,my_reaction:c}}),{headers:e})}catch(o){return new Response(JSON.stringify({ok:!1,message:o.message}),{status:500,headers:e})}if(r.match(/^\/reactions\/\d+\/comments$/)&&i.method==="GET"){let o=parseInt(r.split("/")[2]),{results:n}=await t.DB.prepare("SELECT * FROM reaction_comments WHERE reaction_id = ? ORDER BY like_count DESC LIMIT 50").bind(o).all();return new Response(JSON.stringify({ok:!0,data:n}),{headers:e})}if(r.match(/^\/reactions\/\d+\/posts$/)&&i.method==="GET"){let o=parseInt(r.split("/")[2]),{results:n}=await t.DB.prepare("SELECT * FROM reaction_posts WHERE reaction_id = ? ORDER BY created_at DESC").bind(o).all();return new Response(JSON.stringify({ok:!0,data:n}),{headers:e})}if(r.match(/^\/reactions\/\d+\/posts$/)&&i.method==="POST")try{let o=parseInt(r.split("/")[2]),n=i.headers.get("Authorization")||"",p=n.startsWith("Bearer ")?n.slice(7).trim():null,_=B(i),c=p||_;if(!c)return new Response(JSON.stringify({ok:!1,message:"\uB85C\uADF8\uC778\uC774 \uD544\uC694\uD569\uB2C8\uB2E4."}),{status:401,headers:e});let s=await t.DB.prepare(`SELECT s.user_id AS id, u.nickname
         FROM sessions s
         JOIN users u ON u.id = s.user_id
         WHERE s.id = ?
         LIMIT 1`).bind(c).first();if(!s)return new Response(JSON.stringify({ok:!1,message:"\uB85C\uADF8\uC778\uC774 \uD544\uC694\uD569\uB2C8\uB2E4."}),{status:401,headers:e});let a=await i.json(),{is_spoiler:d,tmdb_id:l}=a,m=(a.content||"").trim();if(!m)return new Response(JSON.stringify({ok:!1,message:"\uB313\uAE00 \uB0B4\uC6A9\uC744 \uC785\uB825\uD574\uC8FC\uC138\uC694"}),{status:400,headers:e});if(m.length>500)return new Response(JSON.stringify({ok:!1,message:"\uB313\uAE00\uC740 500\uC790 \uC774\uB0B4\uB85C \uC785\uB825\uD574\uC8FC\uC138\uC694"}),{status:400,headers:e});let u=await t.DB.prepare(`
        INSERT INTO reaction_posts (reaction_id, tmdb_id, user_id, nickname, content, is_spoiler)
        VALUES (?, ?, ?, ?, ?, ?)
      `).bind(o,l||0,s.id,s.nickname,m,d?1:0).run();return new Response(JSON.stringify({ok:!0,id:u.meta?.last_row_id,nickname:s.nickname}),{headers:e})}catch(o){return new Response(JSON.stringify({ok:!1,message:o.message}),{status:500,headers:e})}if(r.match(/^\/reactions\/posts\/\d+$/)&&i.method==="DELETE")try{let o=parseInt(r.split("/")[3]),n=i.headers.get("Authorization")||"",p=n.startsWith("Bearer ")?n.slice(7).trim():null,_=B(i),c=p||_;if(!c)return new Response(JSON.stringify({ok:!1,message:"\uB85C\uADF8\uC778\uC774 \uD544\uC694\uD569\uB2C8\uB2E4."}),{status:401,headers:e});let s=await t.DB.prepare("SELECT s.user_id AS id FROM sessions s WHERE s.id = ? LIMIT 1").bind(c).first();if(!s)return new Response(JSON.stringify({ok:!1,message:"\uB85C\uADF8\uC778\uC774 \uD544\uC694\uD569\uB2C8\uB2E4."}),{status:401,headers:e});let a=await t.DB.prepare("SELECT id, user_id FROM reaction_posts WHERE id = ?").bind(o).first();return a?a.user_id!==s.id?new Response(JSON.stringify({ok:!1,message:"\uBCF8\uC778 \uB313\uAE00\uB9CC \uC0AD\uC81C\uD560 \uC218 \uC788\uC2B5\uB2C8\uB2E4."}),{status:403,headers:e}):(await t.DB.prepare("DELETE FROM reaction_posts WHERE id = ?").bind(o).run(),new Response(JSON.stringify({ok:!0}),{headers:e})):new Response(JSON.stringify({ok:!1,message:"\uB313\uAE00\uC744 \uCC3E\uC744 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4."}),{status:404,headers:e})}catch(o){return new Response(JSON.stringify({ok:!1,message:o.message}),{status:500,headers:e})}if(r.match(/^\/reactions\/posts\/\d+\/like$/)&&i.method==="POST")try{let o=parseInt(r.split("/")[3]);return await t.DB.prepare("UPDATE reaction_posts SET like_count = like_count + 1 WHERE id = ?").bind(o).run(),new Response(JSON.stringify({ok:!0}),{headers:e})}catch(o){return new Response(JSON.stringify({ok:!1,message:o.message}),{status:500,headers:e})}if(r==="/admin/reactions"&&i.method==="POST"){if(!D(i,t))return new Response(JSON.stringify({ok:!1,message:"Unauthorized"}),{status:401,headers:e});try{let o=await i.json(),{tmdb_id:n,title_ko:p,poster_path:_,video_id:c,video_title:s,channel_name:a,thumbnail:d,view_count:l,like_count:m,published_at:u,custom_title:E}=o;if(!n||!c)return new Response(JSON.stringify({ok:!1,message:"tmdb_id and video_id required"}),{status:400,headers:e});await t.DB.prepare(`
        INSERT OR REPLACE INTO reactions
          (tmdb_id, title_ko, poster_path, platform, video_id, video_title,
           custom_title, channel_name, thumbnail, view_count, like_count, published_at, is_manual)
        VALUES (?, ?, ?, 'youtube', ?, ?, ?, ?, ?, ?, ?, ?, 1)
      `).bind(parseInt(n),p||"",_||"",c,s||"",E||s||"",a||"",d||"",l||0,m||0,u||new Date().toISOString()).run();let g=(await t.DB.prepare("SELECT id FROM reactions WHERE video_id = ? LIMIT 1").bind(c).first())?.id;return g&&t.YOUTUBE_API_KEY&&t.ANTHROPIC_API_KEY&&f.waitUntil(tt(g,c,parseInt(n),t)),new Response(JSON.stringify({ok:!0,reaction_id:g,collecting:!!(g&&t.YOUTUBE_API_KEY),message:t.YOUTUBE_API_KEY?"\uB4F1\uB85D \uC644\uB8CC! \uB313\uAE00 \uC218\uC9D1\xB7\uBC88\uC5ED \uC911 (\uC57D 30\uCD08 \uD6C4 \uD45C\uC2DC)":"\uB4F1\uB85D \uC644\uB8CC"}),{headers:e})}catch(o){return new Response(JSON.stringify({ok:!1,message:o.message}),{status:500,headers:e})}}if(r.match(/^\/admin\/reactions\/\d+\/collect$/)&&i.method==="POST"){if(!D(i,t))return new Response(JSON.stringify({ok:!1,message:"Unauthorized"}),{status:401,headers:e});try{let o=parseInt(r.split("/")[3]),n=await t.DB.prepare("SELECT id, video_id, tmdb_id FROM reactions WHERE id = ? LIMIT 1").bind(o).first();return n?t.YOUTUBE_API_KEY?(f.waitUntil(tt(n.id,n.video_id,n.tmdb_id,t)),new Response(JSON.stringify({ok:!0,message:"\uB313\uAE00 \uC218\uC9D1\xB7\uBC88\uC5ED \uC2DC\uC791! \uC57D 30\uCD08 \uD6C4 \uD655\uC778\uD558\uC138\uC694"}),{headers:e})):new Response(JSON.stringify({ok:!1,message:"YOUTUBE_API_KEY not set"}),{status:500,headers:e}):new Response(JSON.stringify({ok:!1,message:"reaction not found"}),{status:404,headers:e})}catch(o){return new Response(JSON.stringify({ok:!1,message:o.message}),{status:500,headers:e})}}if(r.match(/^\/admin\/reactions\/\d+$/)&&i.method==="PATCH"){if(!D(i,t))return new Response(JSON.stringify({ok:!1,message:"Unauthorized"}),{status:401,headers:e});try{let o=parseInt(r.split("/")[3]),n=await i.json(),{custom_title:p,is_featured_off:_}=n;return _?await t.DB.prepare("UPDATE reactions SET is_featured = 0 WHERE id = ?").bind(o).run():await t.DB.prepare("UPDATE reactions SET custom_title = ? WHERE id = ?").bind(p||"",o).run(),new Response(JSON.stringify({ok:!0}),{headers:e})}catch(o){return new Response(JSON.stringify({ok:!1,message:o.message}),{status:500,headers:e})}}if(r.match(/^\/admin\/reactions\/\d+\/featured$/)&&i.method==="PUT"){if(!D(i,t))return new Response(JSON.stringify({ok:!1,message:"Unauthorized"}),{status:401,headers:e});try{let o=parseInt(r.split("/")[3]);return await t.DB.prepare("UPDATE reactions SET is_featured = 0").run(),await t.DB.prepare("UPDATE reactions SET is_featured = 1 WHERE id = ?").bind(o).run(),new Response(JSON.stringify({ok:!0}),{headers:e})}catch(o){return new Response(JSON.stringify({ok:!1,message:o.message}),{status:500,headers:e})}}if(r.match(/^\/admin\/reactions\/\d+$/)&&i.method==="DELETE"){if(!D(i,t))return new Response(JSON.stringify({ok:!1,message:"Unauthorized"}),{status:401,headers:e});try{let o=parseInt(r.split("/")[3]);return await t.DB.prepare("DELETE FROM reactions WHERE id = ?").bind(o).run(),await t.DB.prepare("DELETE FROM reaction_comments WHERE reaction_id = ?").bind(o).run(),await t.DB.prepare("DELETE FROM reaction_posts WHERE reaction_id = ?").bind(o).run(),new Response(JSON.stringify({ok:!0}),{headers:e})}catch(o){return new Response(JSON.stringify({ok:!1,message:o.message}),{status:500,headers:e})}}return null}var v=["\uADC0\uC5EC\uC6B4","\uC6A9\uAC10\uD55C","\uC2E0\uBE44\uB85C\uC6B4","\uC5C9\uB6B1\uD55C","\uC870\uC6A9\uD55C","\uD65C\uBC1C\uD55C","\uB290\uAE0B\uD55C","\uC5F4\uC815\uC801\uC778","\uB0AD\uB9CC\uC801\uC778","\uC9C4\uC9C0\uD55C","\uC720\uCF8C\uD55C","\uB2F9\uB2F9\uD55C","\uC218\uC90D\uC740","\uB3C5\uD2B9\uD55C","\uBE60\uB978","\uB530\uB73B\uD55C","\uCC28\uAC00\uC6B4","\uBC30\uACE0\uD508","\uC878\uB9B0","\uBA4B\uC9C4","\uD669\uB2F9\uD55C","\uC9C4\uC9C0\uD55C","\uB290\uB9B0","\uC601\uB9AC\uD55C","\uAC15\uD55C"];async function mt(r,i,t,f){let e=new URL(i.url);if(r==="/auth/google"&&i.method==="GET"){let o=e.searchParams.get("redirect")||"",n="https://accounts.google.com/o/oauth2/v2/auth?client_id="+t.GOOGLE_CLIENT_ID+"&redirect_uri="+encodeURIComponent("https://ottrank-api.tdidream.workers.dev/auth/google/callback")+"&response_type=code&scope="+encodeURIComponent("openid email profile")+"&access_type=offline"+(o?"&state="+encodeURIComponent(o):"");return Response.redirect(n,302)}if(r==="/auth/google/callback"&&i.method==="GET"){let o=e.searchParams.get("code");if(!o)return Response.redirect("https://ottrank.kr?login=fail",302);try{let p=await(await fetch("https://oauth2.googleapis.com/token",{method:"POST",headers:{"Content-Type":"application/x-www-form-urlencoded"},body:new URLSearchParams({grant_type:"authorization_code",client_id:t.GOOGLE_CLIENT_ID,client_secret:t.GOOGLE_CLIENT_SECRET,redirect_uri:"https://ottrank-api.tdidream.workers.dev/auth/google/callback",code:o})})).json();if(!p.access_token)return Response.redirect("https://ottrank.kr?login=fail",302);let c=await(await fetch("https://www.googleapis.com/oauth2/v2/userinfo",{headers:{Authorization:"Bearer "+p.access_token}})).json(),s=String(c.id),a=c.email||"",d=c.picture||"",l=await t.DB.prepare("SELECT id, nickname FROM users WHERE provider = 'google' AND provider_id = ?").bind(s).first();await t.DB.prepare(`
        INSERT INTO users (provider, provider_id, nickname, email, avatar_url, last_login)
        VALUES ('google', ?, null, ?, ?, datetime('now'))
        ON CONFLICT(provider, provider_id) DO UPDATE SET
          email      = excluded.email,
          avatar_url = excluded.avatar_url,
          last_login = datetime('now')
      `).bind(s,a,d).run();let m=await t.DB.prepare("SELECT id, nickname, last_login_bonus_date FROM users WHERE provider = 'google' AND provider_id = ?").bind(s).first(),u=!l||!l.nickname||l.nickname.trim()==="",E=crypto.randomUUID(),w=new Date(Date.now()+720*60*60*1e3).toISOString();await t.DB.prepare("INSERT INTO sessions (id, user_id, expires_at) VALUES (?, ?, ?)").bind(E,m.id,w).run();let g=e.searchParams.get("state")||"",y=g?decodeURIComponent(g):"";if(!u){let O=new Date(Date.now()+324e5).toISOString().slice(0,10);m.last_login_bonus_date!==O&&(await P(m.id,3,"login",t),await t.DB.prepare("UPDATE users SET last_login_bonus_date = ? WHERE id = ?").bind(O,m.id).run())}let k=u?`https://ottrank.kr/signup.html?sid=${E}`+(y?`&redirect=${encodeURIComponent(y)}`:""):`https://ottrank.kr/mypage.html?sid=${E}`;return new Response(null,{status:302,headers:{Location:k,"Set-Cookie":`session=${E}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${720*60*60}`}})}catch(n){return console.error("[AUTH] \uAD6C\uAE00 \uCF5C\uBC31 \uC624\uB958:",n.message),Response.redirect("https://ottrank.kr?login=fail",302)}}if(r==="/auth/naver"&&i.method==="GET"){let o=e.searchParams.get("redirect")||"",n=o?encodeURIComponent(o):crypto.randomUUID(),p="https://nid.naver.com/oauth2.0/authorize?client_id="+t.NAVER_CLIENT_ID+"&redirect_uri="+encodeURIComponent("https://ottrank-api.tdidream.workers.dev/auth/naver/callback")+"&response_type=code&state="+n;return Response.redirect(p,302)}if(r==="/auth/naver/callback"&&i.method==="GET"){let o=e.searchParams.get("code");if(!o)return Response.redirect("https://ottrank.kr?login=fail",302);try{let p=await(await fetch("https://nid.naver.com/oauth2.0/token",{method:"POST",headers:{"Content-Type":"application/x-www-form-urlencoded"},body:new URLSearchParams({grant_type:"authorization_code",client_id:t.NAVER_CLIENT_ID,client_secret:t.NAVER_CLIENT_SECRET,redirect_uri:"https://ottrank-api.tdidream.workers.dev/auth/naver/callback",code:o,state:e.searchParams.get("state")||""})})).json();if(!p.access_token)return Response.redirect("https://ottrank.kr?login=fail",302);let s=(await(await fetch("https://openapi.naver.com/v1/nid/me",{headers:{Authorization:"Bearer "+p.access_token}})).json()).response,a=String(s.id),d=s.email||"",l=s.profile_image||"",m=await t.DB.prepare("SELECT id, nickname FROM users WHERE provider = 'naver' AND provider_id = ?").bind(a).first();await t.DB.prepare(`
        INSERT INTO users (provider, provider_id, nickname, email, avatar_url, last_login)
        VALUES ('naver', ?, '', ?, ?, datetime('now'))
        ON CONFLICT(provider, provider_id) DO UPDATE SET
          email      = excluded.email,
          avatar_url = excluded.avatar_url,
          last_login = datetime('now')
      `).bind(a,d,l).run();let u=await t.DB.prepare("SELECT id, nickname, last_login_bonus_date FROM users WHERE provider = 'naver' AND provider_id = ?").bind(a).first(),E=!m||!m.nickname||m.nickname.trim()==="",w=crypto.randomUUID(),g=new Date(Date.now()+720*60*60*1e3).toISOString();await t.DB.prepare("INSERT INTO sessions (id, user_id, expires_at) VALUES (?, ?, ?)").bind(w,u.id,g).run();let y=e.searchParams.get("state")||"",k="";try{k=y?decodeURIComponent(y):""}catch{}if(k.startsWith("/")||(k=""),!E){let R=new Date(Date.now()+324e5).toISOString().slice(0,10);u.last_login_bonus_date!==R&&(await P(u.id,3,"login",t),await t.DB.prepare("UPDATE users SET last_login_bonus_date = ? WHERE id = ?").bind(R,u.id).run())}let O=E?`https://ottrank.kr/signup.html?sid=${w}`+(k?`&redirect=${encodeURIComponent(k)}`:""):`https://ottrank.kr/mypage.html?sid=${w}`;return new Response(null,{status:302,headers:{Location:O,"Set-Cookie":`session=${w}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${720*60*60}`}})}catch(n){return console.error("[AUTH] \uB124\uC774\uBC84 \uCF5C\uBC31 \uC624\uB958:",n.message),Response.redirect("https://ottrank.kr?login=fail",302)}}if(r==="/auth/kakao"&&i.method==="GET"){let o=e.searchParams.get("redirect")||"",n=o?encodeURIComponent(o):"",p="https://kauth.kakao.com/oauth/authorize?client_id="+t.KAKAO_CLIENT_ID+"&redirect_uri="+encodeURIComponent("https://ottrank-api.tdidream.workers.dev/auth/kakao/callback")+"&response_type=code"+(n?"&state="+n:"");return Response.redirect(p,302)}if(r==="/auth/kakao/callback"&&i.method==="GET"){let o=e.searchParams.get("code");if(!o)return Response.redirect("https://ottrank.kr?login=fail",302);try{let p=await(await fetch("https://kauth.kakao.com/oauth/token",{method:"POST",headers:{"Content-Type":"application/x-www-form-urlencoded"},body:new URLSearchParams({grant_type:"authorization_code",client_id:t.KAKAO_CLIENT_ID,client_secret:t.KAKAO_CLIENT_SECRET,redirect_uri:"https://ottrank-api.tdidream.workers.dev/auth/kakao/callback",code:o})})).json();if(!p.access_token)return Response.redirect("https://ottrank.kr?login=fail",302);let c=await(await fetch("https://kapi.kakao.com/v2/user/me",{headers:{Authorization:"Bearer "+p.access_token}})).json(),s=String(c.id),a=c.kakao_account?.profile?.profile_image_url||"",d=c.kakao_account?.email||"",l=await t.DB.prepare("SELECT id, nickname FROM users WHERE provider = 'kakao' AND provider_id = ?").bind(s).first();await t.DB.prepare(`
        INSERT INTO users (provider, provider_id, nickname, email, avatar_url, last_login)
        VALUES ('kakao', ?, '', ?, ?, datetime('now'))
        ON CONFLICT(provider, provider_id) DO UPDATE SET
          email      = excluded.email,
          avatar_url = excluded.avatar_url,
          last_login = datetime('now')
      `).bind(s,d,a).run();let m=await t.DB.prepare("SELECT id, nickname, last_login_bonus_date FROM users WHERE provider = 'kakao' AND provider_id = ?").bind(s).first(),u=!l||!l.nickname||l.nickname.trim()==="",E=crypto.randomUUID(),w=new Date(Date.now()+720*60*60*1e3).toISOString();await t.DB.prepare("INSERT INTO sessions (id, user_id, expires_at) VALUES (?, ?, ?)").bind(E,m.id,w).run();let g=e.searchParams.get("state")||"",y=g?decodeURIComponent(g):"";if(!u){let O=new Date(Date.now()+324e5).toISOString().slice(0,10);m.last_login_bonus_date!==O&&(await P(m.id,3,"login",t),await t.DB.prepare("UPDATE users SET last_login_bonus_date = ? WHERE id = ?").bind(O,m.id).run())}let k=u?`https://ottrank.kr/signup.html?sid=${E}`+(y?`&redirect=${encodeURIComponent(y)}`:""):`https://ottrank.kr/mypage.html?sid=${E}`;return new Response(null,{status:302,headers:{Location:k,"Set-Cookie":`session=${E}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${720*60*60}`}})}catch(n){return console.error("[AUTH] \uCE74\uCE74\uC624 \uCF5C\uBC31 \uC624\uB958:",n.message),Response.redirect("https://ottrank.kr?login=fail",302)}}if(r==="/auth/me"&&i.method==="GET")try{let p=(i.headers.get("Authorization")||"").replace("Bearer ","").trim()||B(i);if(!p)return new Response(JSON.stringify({ok:!1}),{headers:f});let _=await t.DB.prepare("SELECT * FROM sessions WHERE id = ? AND expires_at > datetime('now')").bind(p).first();if(!_)return new Response(JSON.stringify({ok:!1}),{headers:f});let c=await t.DB.prepare("SELECT id, nickname, email, avatar_url, provider, grade, total_likes_received, mbti, ott_points, created_at, last_login_bonus_date FROM users WHERE id = ?").bind(_.user_id).first();if(!c)return new Response(JSON.stringify({ok:!1}),{headers:f});let s=new Date(Date.now()+540*60*1e3).toISOString().slice(0,10);c.last_login_bonus_date!==s&&(await P(c.id,3,"login",t),await t.DB.prepare("UPDATE users SET last_login_bonus_date = ? WHERE id = ?").bind(s,c.id).run(),c.ott_points=(c.ott_points||0)+3,c.last_login_bonus_date=s);let a=await t.DB.prepare("SELECT grade_name, grade_key, emoji_url, sort_order FROM grade_settings WHERE grade_key = ?").bind(c.grade||"rookie").first();return new Response(JSON.stringify({ok:!0,user:{...c,gradeInfo:a||null}}),{headers:f})}catch{return new Response(JSON.stringify({ok:!1}),{headers:f})}if(r==="/auth/random-nickname"&&i.method==="GET")try{let n=(await t.DB.prepare(`
        SELECT title_ko FROM works
        WHERE title_ko IS NOT NULL
          AND title_ko != ''
          AND length(title_ko) <= 10
        ORDER BY RANDOM()
        LIMIT 1
      `).first())?.title_ko||"\uB4DC\uB77C\uB9C8\uD32C",p=v[Math.floor(Math.random()*v.length)],_=Math.floor(Math.random()*9e3)+1e3,c=`${p}${n}${_}`;return c.length>20&&(c=`${p}${n.slice(0,6)}${_}`),new Response(JSON.stringify({ok:!0,nickname:c}),{headers:f})}catch{let n=v[Math.floor(Math.random()*v.length)],p=Math.floor(Math.random()*9e3)+1e3;return new Response(JSON.stringify({ok:!0,nickname:`${n}\uC2DC\uB124\uB9C8${p}`}),{headers:f})}if(r==="/auth/nickname"&&i.method==="POST")try{let o=await i.json(),{nickname:n,sid:p,mbti:_}=o,c=p||B(i);if(!c)return new Response(JSON.stringify({ok:!1,message:"\uB85C\uADF8\uC778\uC774 \uD544\uC694\uD574\uC694"}),{status:401,headers:f});let s=await t.DB.prepare("SELECT * FROM sessions WHERE id = ? AND expires_at > datetime('now')").bind(c).first();if(!s)return new Response(JSON.stringify({ok:!1,message:"\uC138\uC158\uC774 \uB9CC\uB8CC\uB410\uC5B4\uC694"}),{status:401,headers:f});if(!n||n.trim().length<2)return new Response(JSON.stringify({ok:!1,message:"\uB2C9\uB124\uC784\uC740 2\uC790 \uC774\uC0C1 \uC785\uB825\uD574\uC8FC\uC138\uC694"}),{status:400,headers:f});if(n.trim().length>20)return new Response(JSON.stringify({ok:!1,message:"\uB2C9\uB124\uC784\uC740 20\uC790 \uC774\uB0B4\uB85C \uC785\uB825\uD574\uC8FC\uC138\uC694"}),{status:400,headers:f});if(!/^[가-힣a-zA-Z0-9]+$/.test(n.trim()))return new Response(JSON.stringify({ok:!1,message:"\uD55C\uAE00, \uC601\uBB38, \uC22B\uC790\uB9CC \uC0AC\uC6A9\uD560 \uC218 \uC788\uC5B4\uC694"}),{status:400,headers:f});if(await t.DB.prepare("SELECT id FROM users WHERE nickname = ? AND id != ?").bind(n.trim(),s.user_id).first())return new Response(JSON.stringify({ok:!1,message:"\uC774\uBBF8 \uC0AC\uC6A9 \uC911\uC778 \uB2C9\uB124\uC784\uC774\uC5D0\uC694"}),{status:400,headers:f});let l=_&&["INTJ","INTP","ENTJ","ENTP","INFJ","INFP","ENFJ","ENFP","ISTJ","ISFJ","ESTJ","ESFJ","ISTP","ISFP","ESTP","ESFP"].includes(_)?_:null;return await t.DB.prepare("UPDATE users SET nickname = ?, mbti = ? WHERE id = ?").bind(n.trim(),l,s.user_id).run(),await t.DB.prepare("SELECT id FROM user_point_logs WHERE user_id = ? AND reason = 'signup' LIMIT 1").bind(s.user_id).first()||await P(s.user_id,30,"signup",t),l&&(await t.DB.prepare("SELECT id FROM user_point_logs WHERE user_id = ? AND reason = 'mbti_register' LIMIT 1").bind(s.user_id).first()||await P(s.user_id,20,"mbti_register",t)),new Response(JSON.stringify({ok:!0}),{headers:f})}catch(o){return new Response(JSON.stringify({ok:!1,message:o.message}),{status:500,headers:f})}if(r==="/auth/nickname"&&i.method==="PUT")try{let n=(i.headers.get("Authorization")||"").replace("Bearer ","").trim()||B(i);if(!n)return new Response(JSON.stringify({ok:!1,message:"\uB85C\uADF8\uC778 \uD544\uC694"}),{status:401,headers:f});let p=await t.DB.prepare("SELECT * FROM sessions WHERE id = ? AND expires_at > datetime('now')").bind(n).first();if(!p)return new Response(JSON.stringify({ok:!1,message:"\uC138\uC158 \uB9CC\uB8CC"}),{status:401,headers:f});let _=await i.json(),{nickname:c}=_;return!c||c.trim().length<2?new Response(JSON.stringify({ok:!1,message:"\uB2C9\uB124\uC784\uC740 2\uC790 \uC774\uC0C1 \uC785\uB825\uD574\uC8FC\uC138\uC694"}),{status:400,headers:f}):c.trim().length>20?new Response(JSON.stringify({ok:!1,message:"\uB2C9\uB124\uC784\uC740 20\uC790 \uC774\uB0B4\uB85C \uC785\uB825\uD574\uC8FC\uC138\uC694"}),{status:400,headers:f}):/^[가-힣a-zA-Z0-9]+$/.test(c.trim())?await t.DB.prepare("SELECT id FROM users WHERE nickname = ? AND id != ?").bind(c.trim(),p.user_id).first()?new Response(JSON.stringify({ok:!1,message:"\uC774\uBBF8 \uC0AC\uC6A9 \uC911\uC778 \uB2C9\uB124\uC784\uC774\uC5D0\uC694"}),{status:400,headers:f}):(await t.DB.prepare("UPDATE users SET nickname = ? WHERE id = ?").bind(c.trim(),p.user_id).run(),new Response(JSON.stringify({ok:!0}),{headers:f})):new Response(JSON.stringify({ok:!1,message:"\uD55C\uAE00, \uC601\uBB38, \uC22B\uC790\uB9CC \uC0AC\uC6A9\uD560 \uC218 \uC788\uC5B4\uC694"}),{status:400,headers:f})}catch(o){return new Response(JSON.stringify({ok:!1,message:o.message}),{status:500,headers:f})}if(r==="/auth/withdraw"&&i.method==="DELETE")try{let n=(i.headers.get("Authorization")||"").replace("Bearer ","").trim()||B(i);if(!n)return new Response(JSON.stringify({ok:!1,message:"\uB85C\uADF8\uC778 \uD544\uC694"}),{status:401,headers:f});let p=await t.DB.prepare("SELECT user_id FROM sessions WHERE id = ? AND expires_at > datetime('now')").bind(n).first();if(!p)return new Response(JSON.stringify({ok:!1,message:"\uC138\uC158 \uB9CC\uB8CC"}),{status:401,headers:f});let _=p.user_id;return await t.DB.prepare("DELETE FROM sessions  WHERE user_id = ?").bind(_).run(),await t.DB.prepare("DELETE FROM wishlist  WHERE user_id = ?").bind(_).run(),await t.DB.prepare("DELETE FROM reviews   WHERE user_id = ?").bind(_).run(),await t.DB.prepare("DELETE FROM posts     WHERE user_id = ?").bind(_).run(),await t.DB.prepare("DELETE FROM users     WHERE id = ?").bind(_).run(),new Response(JSON.stringify({ok:!0}),{headers:{...f,"Set-Cookie":"session=; Path=/; HttpOnly; Secure; Max-Age=0"}})}catch(o){return new Response(JSON.stringify({ok:!1,message:o.message}),{status:500,headers:f})}if(r==="/auth/mbti"&&i.method==="PATCH")try{let n=(i.headers.get("Authorization")||"").replace("Bearer ","").trim()||B(i);if(!n)return new Response(JSON.stringify({ok:!1,message:"\uB85C\uADF8\uC778 \uD544\uC694"}),{status:401,headers:f});let p=await t.DB.prepare("SELECT * FROM sessions WHERE id = ? AND expires_at > datetime('now')").bind(n).first();if(!p)return new Response(JSON.stringify({ok:!1,message:"\uC138\uC158 \uB9CC\uB8CC"}),{status:401,headers:f});let _=await i.json(),{mbti:c}=_,a=c&&["INTJ","INTP","ENTJ","ENTP","INFJ","INFP","ENFJ","ENFP","ISTJ","ISFJ","ESTJ","ESFJ","ISTP","ISFP","ESTP","ESFP"].includes(c)?c:null,d=await t.DB.prepare("SELECT mbti FROM users WHERE id = ?").bind(p.user_id).first();await t.DB.prepare("UPDATE users SET mbti = ? WHERE id = ?").bind(a,p.user_id).run();let l=!!d?.mbti,m=!!a;return!l&&m?await t.DB.prepare("SELECT id FROM user_point_logs WHERE user_id = ? AND reason = 'mbti_register' LIMIT 1").bind(p.user_id).first()||await P(p.user_id,20,"mbti_register",t):l&&!m&&await P(p.user_id,-20,"mbti_unregister",t),new Response(JSON.stringify({ok:!0,mbti:a}),{headers:f})}catch(o){return new Response(JSON.stringify({ok:!1,message:o.message}),{status:500,headers:f})}if(r==="/auth/logout"&&i.method==="POST")try{let p=(i.headers.get("Authorization")||"").replace("Bearer ","").trim()||B(i);return p&&await t.DB.prepare("DELETE FROM sessions WHERE id = ?").bind(p).run(),new Response(JSON.stringify({ok:!0}),{headers:{...f,"Set-Cookie":"session=; Path=/; HttpOnly; Secure; Max-Age=0"}})}catch(o){return new Response(JSON.stringify({ok:!1,message:o.message}),{status:500,headers:f})}return null}async function ut(r,i,t,f,e){if(r==="/wishlist"&&i.method==="GET")try{let p=(i.headers.get("Authorization")||"").replace("Bearer ","").trim()||B(i);if(!p)return new Response(JSON.stringify({ok:!1,message:"\uB85C\uADF8\uC778 \uD544\uC694"}),{status:401,headers:e});let _=await t.DB.prepare("SELECT user_id FROM sessions WHERE id = ? AND expires_at > datetime('now')").bind(p).first();if(!_)return new Response(JSON.stringify({ok:!1}),{status:401,headers:e});let{results:c}=await t.DB.prepare("SELECT * FROM wishlist WHERE user_id = ? ORDER BY created_at DESC").bind(_.user_id).all();return new Response(JSON.stringify({ok:!0,data:c}),{headers:e})}catch(n){return new Response(JSON.stringify({ok:!1,message:n.message}),{status:500,headers:e})}if(r==="/wishlist"&&i.method==="POST")try{let p=(i.headers.get("Authorization")||"").replace("Bearer ","").trim()||B(i);if(!p)return new Response(JSON.stringify({ok:!1,message:"\uB85C\uADF8\uC778 \uD544\uC694"}),{status:401,headers:e});let _=await t.DB.prepare("SELECT user_id FROM sessions WHERE id = ? AND expires_at > datetime('now')").bind(p).first();if(!_)return new Response(JSON.stringify({ok:!1,message:"\uC138\uC158 \uB9CC\uB8CC"}),{status:401,headers:e});let c=await i.json(),{tmdb_id:s,title_ko:a,poster_path:d,release_year:l,category:m}=c;return s?await t.DB.prepare("SELECT id FROM wishlist WHERE user_id = ? AND tmdb_id = ?").bind(_.user_id,parseInt(s)).first()?(await t.DB.prepare("DELETE FROM wishlist WHERE user_id = ? AND tmdb_id = ?").bind(_.user_id,parseInt(s)).run(),f.waitUntil($(_.user_id,t)),new Response(JSON.stringify({ok:!0,wishlisted:!1}),{headers:e})):(await t.DB.prepare("INSERT INTO wishlist (user_id, tmdb_id, title_ko, poster_path, release_year, category) VALUES (?, ?, ?, ?, ?, ?)").bind(_.user_id,parseInt(s),a||"",d||"",l||"",m||"movie").run(),f.waitUntil(P(_.user_id,1,"wishlist",t)),f.waitUntil($(_.user_id,t)),new Response(JSON.stringify({ok:!0,wishlisted:!0}),{headers:e})):new Response(JSON.stringify({ok:!1,message:"tmdb_id \uD544\uC694"}),{status:400,headers:e})}catch(n){return new Response(JSON.stringify({ok:!1,message:n.message}),{status:500,headers:e})}if(r.match(/^\/wishlist\/check\/\d+$/)&&i.method==="GET")try{let n=parseInt(r.split("/")[3]),_=(i.headers.get("Authorization")||"").replace("Bearer ","").trim()||B(i);if(!_)return new Response(JSON.stringify({ok:!0,wishlisted:!1}),{headers:e});let c=await t.DB.prepare("SELECT user_id FROM sessions WHERE id = ? AND expires_at > datetime('now')").bind(_).first();if(!c)return new Response(JSON.stringify({ok:!0,wishlisted:!1}),{headers:e});let s=await t.DB.prepare("SELECT id FROM wishlist WHERE user_id = ? AND tmdb_id = ?").bind(c.user_id,n).first();return new Response(JSON.stringify({ok:!0,wishlisted:!!s}),{headers:e})}catch{return new Response(JSON.stringify({ok:!0,wishlisted:!1}),{headers:e})}if(r.match(/^\/reviews\/\d+$/)&&i.method==="GET")try{let n=parseInt(r.split("/")[2]),_=(i.headers.get("Authorization")||"").replace("Bearer ","").trim()||B(i),c=-1;if(_){let a=await t.DB.prepare("SELECT user_id FROM sessions WHERE id = ? AND expires_at > datetime('now')").bind(_).first();a&&(c=a.user_id)}let{results:s}=await t.DB.prepare(`
        SELECT r.*, u.nickname, u.provider, u.grade, u.mbti,
          gs.emoji_url as grade_emoji_url, gs.grade_name,
          CASE WHEN rl.id IS NOT NULL THEN 1 ELSE 0 END AS liked_by_me
        FROM reviews r
        JOIN users u ON r.user_id = u.id
        LEFT JOIN grade_settings gs ON gs.grade_key = u.grade
        LEFT JOIN review_likes rl ON rl.review_id = r.id AND rl.user_id = ? AND rl.is_active = 1
        WHERE r.tmdb_id = ?
        ORDER BY r.likes DESC, r.created_at DESC
      `).bind(c,n).all();return new Response(JSON.stringify({ok:!0,data:s}),{headers:e})}catch(n){return new Response(JSON.stringify({ok:!1,message:n.message}),{status:500,headers:e})}if(r.match(/^\/reviews\/\d+\/me$/)&&i.method==="GET")try{let n=parseInt(r.split("/")[2]),_=(i.headers.get("Authorization")||"").replace("Bearer ","").trim()||B(i);if(!_)return new Response(JSON.stringify({ok:!0,data:null}),{headers:e});let c=await t.DB.prepare("SELECT user_id FROM sessions WHERE id = ? AND expires_at > datetime('now')").bind(_).first();if(!c)return new Response(JSON.stringify({ok:!0,data:null}),{headers:e});let s=await t.DB.prepare("SELECT * FROM reviews WHERE tmdb_id = ? AND user_id = ?").bind(n,c.user_id).first();return new Response(JSON.stringify({ok:!0,data:s||null}),{headers:e})}catch(n){return new Response(JSON.stringify({ok:!1,message:n.message}),{status:500,headers:e})}if(r.match(/^\/reviews\/\d+$/)&&i.method==="POST")try{let n=parseInt(r.split("/")[2]),_=(i.headers.get("Authorization")||"").replace("Bearer ","").trim()||B(i);if(!_)return new Response(JSON.stringify({ok:!1,message:"\uB85C\uADF8\uC778 \uD544\uC694"}),{status:401,headers:e});let c=await t.DB.prepare("SELECT user_id FROM sessions WHERE id = ? AND expires_at > datetime('now')").bind(_).first();if(!c)return new Response(JSON.stringify({ok:!1,message:"\uC138\uC158 \uB9CC\uB8CC"}),{status:401,headers:e});let s=await i.json(),{score:a,emotions:d,custom_tags:l,text:m,spoiler:u}=s;if(!a||a<.5||a>10)return new Response(JSON.stringify({ok:!1,message:"\uBCC4\uC810\uC744 \uC120\uD0DD\uD574\uC8FC\uC138\uC694 (0.5~10)"}),{status:400,headers:e});let w=!await t.DB.prepare("SELECT id FROM reviews WHERE tmdb_id = ? AND user_id = ?").bind(n,c.user_id).first();return await t.DB.prepare(`
        INSERT INTO reviews (tmdb_id, user_id, score, emotions, custom_tags, text, spoiler)
        VALUES (?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(tmdb_id, user_id) DO UPDATE SET
          score       = excluded.score,
          emotions    = excluded.emotions,
          custom_tags = excluded.custom_tags,
          text        = excluded.text,
          spoiler     = excluded.spoiler,
          created_at  = datetime('now')
      `).bind(n,c.user_id,a,JSON.stringify(d||[]),JSON.stringify(l||[]),(m||"").slice(0,500),u?1:0).run(),w&&f.waitUntil(P(c.user_id,10,"review",t)),f.waitUntil($(c.user_id,t)),new Response(JSON.stringify({ok:!0}),{headers:e})}catch(n){return new Response(JSON.stringify({ok:!1,message:n.message}),{status:500,headers:e})}if(r.match(/^\/reviews\/\d+\/like\/\d+$/)&&i.method==="POST")try{let n=parseInt(r.split("/")[4]),_=(i.headers.get("Authorization")||"").replace("Bearer ","").trim()||B(i);if(!_)return new Response(JSON.stringify({ok:!1,message:"\uB85C\uADF8\uC778 \uD544\uC694"}),{status:401,headers:e});let c=await t.DB.prepare("SELECT user_id FROM sessions WHERE id = ? AND expires_at > datetime('now')").bind(_).first();if(!c)return new Response(JSON.stringify({ok:!1,message:"\uC138\uC158 \uB9CC\uB8CC"}),{status:401,headers:e});let s=await t.DB.prepare("SELECT user_id FROM reviews WHERE id = ?").bind(n).first();if(!s)return new Response(JSON.stringify({ok:!1,message:"\uB9AC\uBDF0\uB97C \uCC3E\uC744 \uC218 \uC5C6\uC5B4\uC694"}),{status:404,headers:e});let a=await t.DB.prepare("SELECT id, is_active FROM review_likes WHERE review_id = ? AND user_id = ?").bind(n,c.user_id).first(),d;a?a.is_active?(await t.DB.prepare("UPDATE review_likes SET is_active = 0 WHERE id = ?").bind(a.id).run(),await t.DB.prepare("UPDATE reviews SET likes = MAX(0, likes - 1) WHERE id = ?").bind(n).run(),s.user_id&&await t.DB.prepare("UPDATE users SET total_likes_received = MAX(0, total_likes_received - 1) WHERE id = ?").bind(s.user_id).run(),d=!1):(await t.DB.prepare("UPDATE review_likes SET is_active = 1 WHERE id = ?").bind(a.id).run(),await t.DB.prepare("UPDATE reviews SET likes = likes + 1 WHERE id = ?").bind(n).run(),s.user_id&&await t.DB.prepare("UPDATE users SET total_likes_received = total_likes_received + 1 WHERE id = ?").bind(s.user_id).run(),d=!0):(await t.DB.prepare("INSERT INTO review_likes (review_id, user_id, is_active) VALUES (?, ?, 1)").bind(n,c.user_id).run(),await t.DB.prepare("UPDATE reviews SET likes = likes + 1 WHERE id = ?").bind(n).run(),s.user_id&&(await t.DB.prepare("UPDATE users SET total_likes_received = total_likes_received + 1 WHERE id = ?").bind(s.user_id).run(),f.waitUntil(P(s.user_id,1,"like_received",t)),f.waitUntil($(s.user_id,t))),d=!0);let l=await t.DB.prepare("SELECT likes FROM reviews WHERE id = ?").bind(n).first();return new Response(JSON.stringify({ok:!0,liked:d,likes:l?.likes??0}),{headers:e})}catch(n){return new Response(JSON.stringify({ok:!1,message:n.message}),{status:500,headers:e})}if(r.match(/^\/reviews\/\d+$/)&&i.method==="DELETE")try{let n=parseInt(r.split("/")[2]),_=(i.headers.get("Authorization")||"").replace("Bearer ","").trim()||B(i);if(!_)return new Response(JSON.stringify({ok:!1,message:"\uB85C\uADF8\uC778 \uD544\uC694"}),{status:401,headers:e});let c=await t.DB.prepare("SELECT user_id FROM sessions WHERE id = ? AND expires_at > datetime('now')").bind(_).first();return c?(await t.DB.prepare("DELETE FROM reviews WHERE tmdb_id = ? AND user_id = ?").bind(n,c.user_id).run(),f.waitUntil($(c.user_id,t)),new Response(JSON.stringify({ok:!0}),{headers:e})):new Response(JSON.stringify({ok:!1,message:"\uC138\uC158 \uB9CC\uB8CC"}),{status:401,headers:e})}catch(n){return new Response(JSON.stringify({ok:!1,message:n.message}),{status:500,headers:e})}if(r==="/mypage"&&i.method==="GET")try{let p=(i.headers.get("Authorization")||"").replace("Bearer ","").trim()||B(i);if(!p)return new Response(JSON.stringify({ok:!1,message:"\uB85C\uADF8\uC778 \uD544\uC694"}),{status:401,headers:e});let _=await t.DB.prepare("SELECT user_id FROM sessions WHERE id = ? AND expires_at > datetime('now')").bind(p).first();if(!_)return new Response(JSON.stringify({ok:!1,message:"\uC138\uC158 \uB9CC\uB8CC"}),{status:401,headers:e});let c=_.user_id,[s,a,d,l,m,u,E,w]=await t.DB.batch([t.DB.prepare(`
          SELECT u.id, u.nickname, u.provider, u.email, u.avatar_url,
            u.grade, u.total_likes_received, u.created_at, u.wishlist_public, u.mbti,
            u.ott_points,
            gs.grade_name, gs.emoji_url as grade_emoji_url, gs.sort_order as grade_order,
            gs.is_special as grade_is_special
          FROM users u
          LEFT JOIN grade_settings gs ON gs.grade_key = u.grade
          WHERE u.id = ?
        `).bind(c),t.DB.prepare(`
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
        `).bind(c,c),t.DB.prepare(`
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
        `).bind(c,c),t.DB.prepare(`
          SELECT id, board_type, title, like_count, view_count, created_at
          FROM posts
          WHERE user_id = ? AND is_hidden = 0
          ORDER BY created_at DESC
        `).bind(c),t.DB.prepare(`
          SELECT lw.*,
            COALESCE(wk.poster_path, lw.poster_path) as poster_path,
            COALESCE(wk.title_ko, lw.title_ko) as title_ko
          FROM life_works lw
          LEFT JOIN works wk ON wk.tmdb_id = lw.tmdb_id
          WHERE lw.user_id = ?
          ORDER BY lw.created_at DESC
        `).bind(c),t.DB.prepare("SELECT * FROM pick_lists WHERE user_id = ? ORDER BY created_at DESC").bind(c),t.DB.prepare(`
          SELECT points, reason, created_at
          FROM user_point_logs
          WHERE user_id = ?
          ORDER BY created_at DESC
          LIMIT 20
        `).bind(c),t.DB.prepare("SELECT grade_key, grade_name, min_ott_points, emoji_url, is_special, sort_order FROM grade_settings ORDER BY sort_order ASC")]),g=s.results[0]||null,y=a.results,k=d.results,O=l.results,R=m.results,S=u.results,h=E.results,b=w.results,N=[];if(S.length){let T=await t.DB.batch(S.map(A=>t.DB.prepare("SELECT * FROM pick_list_works WHERE pick_list_id = ? ORDER BY sort_order ASC, created_at DESC").bind(A.id)));N=S.map((A,L)=>{let C=T[L].results;return{...A,works:C,work_count:C.length}})}return new Response(JSON.stringify({ok:!0,is_own:!0,user:g,reviews:y,wishlist:k,posts:O,life_works:R,pick_lists:N,recent_point_logs:h,grade_settings:b,stats:{review_count:y.length,wishlist_count:k.length,likes_received:g?.total_likes_received||0,post_count:O.length,life_work_count:R.length,pick_list_count:N.length}}),{headers:e})}catch(n){return new Response(JSON.stringify({ok:!1,message:n.message}),{status:500,headers:e})}if(r==="/mypage/summary"&&i.method==="GET")try{let p=(i.headers.get("Authorization")||"").replace("Bearer ","").trim()||B(i);if(!p)return new Response(JSON.stringify({ok:!1,message:"\uB85C\uADF8\uC778 \uD544\uC694"}),{status:401,headers:e});let _=await t.DB.prepare("SELECT user_id FROM sessions WHERE id = ? AND expires_at > datetime('now')").bind(p).first();if(!_)return new Response(JSON.stringify({ok:!1,message:"\uC138\uC158 \uB9CC\uB8CC"}),{status:401,headers:e});let c=await t.DB.prepare(`
        SELECT u.id, u.nickname, u.grade, u.ott_points,
          gs.grade_name, gs.emoji_url as grade_emoji_url, gs.sort_order as grade_order,
          gs.is_special as grade_is_special
        FROM users u
        LEFT JOIN grade_settings gs ON gs.grade_key = u.grade
        WHERE u.id = ?
      `).bind(_.user_id).first();return new Response(JSON.stringify({ok:!0,user:c}),{headers:e})}catch(n){return new Response(JSON.stringify({ok:!1,message:n.message}),{status:500,headers:e})}if(r==="/mypage/point-logs"&&i.method==="GET")try{let p=(i.headers.get("Authorization")||"").replace("Bearer ","").trim()||B(i);if(!p)return new Response(JSON.stringify({ok:!1,message:"\uB85C\uADF8\uC778 \uD544\uC694"}),{status:401,headers:e});let _=await t.DB.prepare("SELECT user_id FROM sessions WHERE id = ? AND expires_at > datetime('now')").bind(p).first();if(!_)return new Response(JSON.stringify({ok:!1,message:"\uC138\uC158 \uB9CC\uB8CC"}),{status:401,headers:e});let c=new URL(i.url).searchParams,s=Math.max(1,parseInt(c.get("page")||"1")),a=Math.min(50,Math.max(1,parseInt(c.get("limit")||"10"))),d=(s-1)*a,[l,m]=await t.DB.batch([t.DB.prepare("SELECT COUNT(*) AS total FROM user_point_logs WHERE user_id = ?").bind(_.user_id),t.DB.prepare(`
          SELECT points, reason, created_at
          FROM user_point_logs
          WHERE user_id = ?
          ORDER BY created_at DESC
          LIMIT ? OFFSET ?
        `).bind(_.user_id,a,d)]),u=l.results[0]?.total||0,E=m.results;return new Response(JSON.stringify({ok:!0,logs:E,total:u,page:s,limit:a}),{headers:e})}catch(n){return new Response(JSON.stringify({ok:!1,message:n.message}),{status:500,headers:e})}if(r==="/mypage/wishlist-public"&&i.method==="PATCH")try{let p=(i.headers.get("Authorization")||"").replace("Bearer ","").trim()||B(i);if(!p)return new Response(JSON.stringify({ok:!1,message:"\uB85C\uADF8\uC778 \uD544\uC694"}),{status:401,headers:e});let _=await t.DB.prepare("SELECT user_id FROM sessions WHERE id = ? AND expires_at > datetime('now')").bind(p).first();if(!_)return new Response(JSON.stringify({ok:!1,message:"\uC138\uC158 \uB9CC\uB8CC"}),{status:401,headers:e});let s=(await i.json()).wishlist_public?1:0;return await t.DB.prepare("UPDATE users SET wishlist_public = ? WHERE id = ?").bind(s,_.user_id).run(),new Response(JSON.stringify({ok:!0,wishlist_public:s}),{headers:e})}catch(n){return new Response(JSON.stringify({ok:!1,message:n.message}),{status:500,headers:e})}if(r.match(/^\/user\/\d+$/)&&i.method==="GET")try{let n=parseInt(r.split("/")[2]),p=await t.DB.prepare(`
        SELECT u.id, u.nickname, u.grade, u.total_likes_received, u.created_at,
          u.wishlist_public, u.mbti,
          gs.grade_name, gs.emoji_url as grade_emoji_url, gs.is_special as grade_is_special
        FROM users u
        LEFT JOIN grade_settings gs ON gs.grade_key = u.grade
        WHERE u.id = ?
      `).bind(n).first();if(!p)return new Response(JSON.stringify({ok:!1,message:"\uC720\uC800\uB97C \uCC3E\uC744 \uC218 \uC5C6\uC5B4\uC694"}),{status:404,headers:e});let{results:_}=await t.DB.prepare(`
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
      `).bind(n,n).all(),c=[];if(p.wishlist_public){let{results:m}=await t.DB.prepare(`
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
        `).bind(n,n).all();c=m}let{results:s}=await t.DB.prepare(`
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
      `).bind(n).all(),{results:d}=await t.DB.prepare("SELECT * FROM pick_lists WHERE user_id = ? AND is_public = 1 ORDER BY created_at DESC").bind(n).all(),l=await Promise.all(d.map(async m=>{let{results:u}=await t.DB.prepare("SELECT * FROM pick_list_works WHERE pick_list_id = ? ORDER BY sort_order ASC, created_at DESC").bind(m.id).all();return{...m,works:u,work_count:u.length}}));return new Response(JSON.stringify({ok:!0,is_own:!1,user:p,reviews:_,wishlist:c,wishlist_hidden:!p.wishlist_public,posts:s,life_works:a,pick_lists:l,stats:{review_count:_.length,wishlist_count:p.wishlist_public?c.length:null,likes_received:p.total_likes_received||0,post_count:s.length,life_work_count:a.length,pick_list_count:l.length}}),{headers:e})}catch(n){return new Response(JSON.stringify({ok:!1,message:n.message}),{status:500,headers:e})}if(r==="/mypage/reviews"&&i.method==="GET")try{let p=(i.headers.get("Authorization")||"").replace("Bearer ","").trim()||B(i);if(!p)return new Response(JSON.stringify({ok:!1,message:"\uB85C\uADF8\uC778 \uD544\uC694"}),{status:401,headers:e});let _=await t.DB.prepare("SELECT user_id FROM sessions WHERE id = ? AND expires_at > datetime('now')").bind(p).first();if(!_)return new Response(JSON.stringify({ok:!1,message:"\uC138\uC158 \uB9CC\uB8CC"}),{status:401,headers:e});let c=await t.DB.prepare("SELECT nickname FROM users WHERE id = ?").bind(_.user_id).first(),{results:s}=await t.DB.prepare(`
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
      `).bind(_.user_id,_.user_id).all();return new Response(JSON.stringify({ok:!0,reviews:s,nickname:c?.nickname||"\uB098"}),{headers:e})}catch(n){return new Response(JSON.stringify({ok:!1,message:n.message}),{status:500,headers:e})}if(r.match(/^\/user\/\d+\/reviews$/)&&i.method==="GET")try{let n=parseInt(r.split("/")[2]),p=await t.DB.prepare("SELECT nickname FROM users WHERE id = ?").bind(n).first();if(!p)return new Response(JSON.stringify({ok:!1,message:"\uC720\uC800\uB97C \uCC3E\uC744 \uC218 \uC5C6\uC5B4\uC694"}),{status:404,headers:e});let c=(i.headers.get("Authorization")||"").replace("Bearer ","").trim()||B(i),s=-1;if(c){let d=await t.DB.prepare("SELECT user_id FROM sessions WHERE id = ? AND expires_at > datetime('now')").bind(c).first();d&&(s=d.user_id)}let{results:a}=await t.DB.prepare(`
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
      `).bind(n,s,n).all();return new Response(JSON.stringify({ok:!0,reviews:a,nickname:p.nickname||"\uC720\uC800"}),{headers:e})}catch(n){return new Response(JSON.stringify({ok:!1,message:n.message}),{status:500,headers:e})}if(r==="/life-works"&&i.method==="POST")try{let p=(i.headers.get("Authorization")||"").replace("Bearer ","").trim()||B(i);if(!p)return new Response(JSON.stringify({ok:!1,message:"\uB85C\uADF8\uC778 \uD544\uC694"}),{status:401,headers:e});let _=await t.DB.prepare("SELECT user_id FROM sessions WHERE id = ? AND expires_at > datetime('now')").bind(p).first();if(!_)return new Response(JSON.stringify({ok:!1,message:"\uC138\uC158 \uB9CC\uB8CC"}),{status:401,headers:e});let{tmdb_id:c,title_ko:s,poster_path:a,media_type:d}=await i.json();return c?await t.DB.prepare("SELECT id FROM life_works WHERE user_id = ? AND tmdb_id = ?").bind(_.user_id,parseInt(c)).first()?(await t.DB.prepare("DELETE FROM life_works WHERE user_id = ? AND tmdb_id = ?").bind(_.user_id,parseInt(c)).run(),new Response(JSON.stringify({ok:!0,saved:!1}),{headers:e})):(await t.DB.prepare("INSERT INTO life_works (user_id, tmdb_id, title_ko, poster_path, media_type) VALUES (?, ?, ?, ?, ?)").bind(_.user_id,parseInt(c),s||"",a||"",d||"tv").run(),f.waitUntil(P(_.user_id,2,"life_work",t)),new Response(JSON.stringify({ok:!0,saved:!0}),{headers:e})):new Response(JSON.stringify({ok:!1,message:"tmdb_id \uD544\uC694"}),{status:400,headers:e})}catch(n){return new Response(JSON.stringify({ok:!1,message:n.message}),{status:500,headers:e})}if(r.match(/^\/life-works\/check\/\d+$/)&&i.method==="GET")try{let n=parseInt(r.split("/")[3]),_=(i.headers.get("Authorization")||"").replace("Bearer ","").trim()||B(i);if(!_)return new Response(JSON.stringify({ok:!0,saved:!1}),{headers:e});let c=await t.DB.prepare("SELECT user_id FROM sessions WHERE id = ? AND expires_at > datetime('now')").bind(_).first();if(!c)return new Response(JSON.stringify({ok:!0,saved:!1}),{headers:e});let s=await t.DB.prepare("SELECT id FROM life_works WHERE user_id = ? AND tmdb_id = ?").bind(c.user_id,n).first();return new Response(JSON.stringify({ok:!0,saved:!!s}),{headers:e})}catch{return new Response(JSON.stringify({ok:!0,saved:!1}),{headers:e})}if(r==="/pick-lists"&&i.method==="GET")try{let p=(i.headers.get("Authorization")||"").replace("Bearer ","").trim()||B(i);if(!p)return new Response(JSON.stringify({ok:!1,message:"\uB85C\uADF8\uC778 \uD544\uC694"}),{status:401,headers:e});let _=await t.DB.prepare("SELECT user_id FROM sessions WHERE id = ? AND expires_at > datetime('now')").bind(p).first();if(!_)return new Response(JSON.stringify({ok:!1,message:"\uC138\uC158 \uB9CC\uB8CC"}),{status:401,headers:e});let{results:c}=await t.DB.prepare("SELECT * FROM pick_lists WHERE user_id = ? ORDER BY created_at DESC").bind(_.user_id).all(),s=await Promise.all(c.map(async a=>{let{results:d}=await t.DB.prepare("SELECT * FROM pick_list_works WHERE pick_list_id = ? ORDER BY sort_order ASC, created_at DESC").bind(a.id).all();return{...a,works:d,work_count:d.length}}));return new Response(JSON.stringify({ok:!0,data:s}),{headers:e})}catch(n){return new Response(JSON.stringify({ok:!1,message:n.message}),{status:500,headers:e})}if(r==="/pick-lists"&&i.method==="POST")try{let p=(i.headers.get("Authorization")||"").replace("Bearer ","").trim()||B(i);if(!p)return new Response(JSON.stringify({ok:!1,message:"\uB85C\uADF8\uC778 \uD544\uC694"}),{status:401,headers:e});let _=await t.DB.prepare("SELECT user_id FROM sessions WHERE id = ? AND expires_at > datetime('now')").bind(p).first();if(!_)return new Response(JSON.stringify({ok:!1,message:"\uC138\uC158 \uB9CC\uB8CC"}),{status:401,headers:e});let{title:c,description:s,is_public:a}=await i.json();if(!c||!c.trim())return new Response(JSON.stringify({ok:!1,message:"\uCEEC\uB809\uC158 \uC81C\uBAA9\uC744 \uC785\uB825\uD574\uC8FC\uC138\uC694"}),{status:400,headers:e});let d=await t.DB.prepare("INSERT INTO pick_lists (user_id, title, description, is_public) VALUES (?, ?, ?, ?)").bind(_.user_id,c.trim().slice(0,50),(s||"").slice(0,200),a!==!1?1:0).run(),l=await t.DB.prepare("SELECT id FROM pick_lists WHERE user_id = ? ORDER BY id DESC LIMIT 1").bind(_.user_id).first();return f.waitUntil(P(_.user_id,2,"pick_list",t)),new Response(JSON.stringify({ok:!0,id:l?.id||null}),{headers:e})}catch(n){return new Response(JSON.stringify({ok:!1,message:n.message}),{status:500,headers:e})}if(r.match(/^\/pick-lists\/\d+$/)&&i.method==="DELETE")try{let n=parseInt(r.split("/")[2]),_=(i.headers.get("Authorization")||"").replace("Bearer ","").trim()||B(i);if(!_)return new Response(JSON.stringify({ok:!1,message:"\uB85C\uADF8\uC778 \uD544\uC694"}),{status:401,headers:e});let c=await t.DB.prepare("SELECT user_id FROM sessions WHERE id = ? AND expires_at > datetime('now')").bind(_).first();return c?await t.DB.prepare("SELECT id FROM pick_lists WHERE id = ? AND user_id = ?").bind(n,c.user_id).first()?(await t.DB.prepare("DELETE FROM pick_lists WHERE id = ?").bind(n).run(),new Response(JSON.stringify({ok:!0}),{headers:e})):new Response(JSON.stringify({ok:!1,message:"\uCEEC\uB809\uC158\uC744 \uCC3E\uC744 \uC218 \uC5C6\uC5B4\uC694"}),{status:404,headers:e}):new Response(JSON.stringify({ok:!1,message:"\uC138\uC158 \uB9CC\uB8CC"}),{status:401,headers:e})}catch(n){return new Response(JSON.stringify({ok:!1,message:n.message}),{status:500,headers:e})}if(r.match(/^\/pick-lists\/\d+\/works$/)&&i.method==="POST")try{let n=parseInt(r.split("/")[2]),_=(i.headers.get("Authorization")||"").replace("Bearer ","").trim()||B(i);if(!_)return new Response(JSON.stringify({ok:!1,message:"\uB85C\uADF8\uC778 \uD544\uC694"}),{status:401,headers:e});let c=await t.DB.prepare("SELECT user_id FROM sessions WHERE id = ? AND expires_at > datetime('now')").bind(_).first();if(!c)return new Response(JSON.stringify({ok:!1,message:"\uC138\uC158 \uB9CC\uB8CC"}),{status:401,headers:e});if(!await t.DB.prepare("SELECT id FROM pick_lists WHERE id = ? AND user_id = ?").bind(n,c.user_id).first())return new Response(JSON.stringify({ok:!1,message:"\uCEEC\uB809\uC158\uC744 \uCC3E\uC744 \uC218 \uC5C6\uC5B4\uC694"}),{status:404,headers:e});let{tmdb_id:a,title_ko:d,poster_path:l,media_type:m}=await i.json();return a?await t.DB.prepare("SELECT id FROM pick_list_works WHERE pick_list_id = ? AND tmdb_id = ?").bind(n,parseInt(a)).first()?(await t.DB.prepare("DELETE FROM pick_list_works WHERE pick_list_id = ? AND tmdb_id = ?").bind(n,parseInt(a)).run(),new Response(JSON.stringify({ok:!0,added:!1}),{headers:e})):(await t.DB.prepare("INSERT INTO pick_list_works (pick_list_id, tmdb_id, title_ko, poster_path, media_type) VALUES (?, ?, ?, ?, ?)").bind(n,parseInt(a),d||"",l||"",m||"tv").run(),new Response(JSON.stringify({ok:!0,added:!0}),{headers:e})):new Response(JSON.stringify({ok:!1,message:"tmdb_id \uD544\uC694"}),{status:400,headers:e})}catch(n){return new Response(JSON.stringify({ok:!1,message:n.message}),{status:500,headers:e})}if(r.match(/^\/pick-lists\/check\/\d+$/)&&i.method==="GET")try{let n=parseInt(r.split("/")[3]),_=(i.headers.get("Authorization")||"").replace("Bearer ","").trim()||B(i);if(!_)return new Response(JSON.stringify({ok:!0,lists:[]}),{headers:e});let c=await t.DB.prepare("SELECT user_id FROM sessions WHERE id = ? AND expires_at > datetime('now')").bind(_).first();if(!c)return new Response(JSON.stringify({ok:!0,lists:[]}),{headers:e});let{results:s}=await t.DB.prepare("SELECT * FROM pick_lists WHERE user_id = ? ORDER BY created_at DESC").bind(c.user_id).all(),a=await Promise.all(s.map(async d=>{let l=await t.DB.prepare("SELECT id FROM pick_list_works WHERE pick_list_id = ? AND tmdb_id = ?").bind(d.id,n).first(),{results:m}=await t.DB.prepare("SELECT COUNT(*) as cnt FROM pick_list_works WHERE pick_list_id = ?").bind(d.id).all();return{...d,has_work:!!l,work_count:m[0]?.cnt||0}}));return new Response(JSON.stringify({ok:!0,lists:a}),{headers:e})}catch{return new Response(JSON.stringify({ok:!0,lists:[]}),{headers:e})}if(r==="/reviews/recent"&&i.method==="GET")try{let n=new URL(i.url).searchParams,p=Math.min(parseInt(n.get("limit")||"5"),20),_=Math.max(1,parseInt(n.get("page")||"1")),c=(_-1)*p,a=(i.headers.get("Authorization")||"").replace("Bearer ","").trim()||B(i),d=-1;if(a){let E=await t.DB.prepare("SELECT user_id FROM sessions WHERE id = ? AND expires_at > datetime('now')").bind(a).first();E&&(d=E.user_id)}let m=(await t.DB.prepare("SELECT COUNT(*) AS total FROM reviews").first())?.total||0,{results:u}=await t.DB.prepare(`
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
      `).bind(d,p,c).all();return new Response(JSON.stringify({ok:!0,reviews:u||[],total:m,page:_,limit:p}),{headers:e})}catch(n){return new Response(JSON.stringify({ok:!1,message:n.message}),{status:500,headers:e})}if(r==="/grade-settings"&&i.method==="GET")try{let{results:n}=await t.DB.prepare("SELECT * FROM grade_settings ORDER BY sort_order ASC").all();return new Response(JSON.stringify({ok:!0,data:n}),{headers:e})}catch(n){return new Response(JSON.stringify({ok:!1,message:n.message}),{status:500,headers:e})}if(r==="/reviews/share"&&i.method==="POST")try{let p=(i.headers.get("Authorization")||"").replace("Bearer ","").trim()||B(i);if(!p)return new Response(JSON.stringify({ok:!1,message:"\uB85C\uADF8\uC778 \uD544\uC694"}),{status:401,headers:e});let _=await t.DB.prepare("SELECT user_id FROM sessions WHERE id = ? AND expires_at > datetime('now')").bind(p).first();if(!_)return new Response(JSON.stringify({ok:!1,message:"\uC138\uC158 \uB9CC\uB8CC"}),{status:401,headers:e});let c=new Date(Date.now()+540*60*1e3).toISOString().slice(0,10);return await t.DB.prepare(`SELECT id FROM user_point_logs
         WHERE user_id = ? AND reason = 'share'
         AND DATE(created_at) = ?
         LIMIT 1`).bind(_.user_id,c).first()?new Response(JSON.stringify({ok:!0,already:!0,message:"\uC624\uB298\uC740 \uC774\uBBF8 \uACF5\uC720 \uC624\uB728\uB97C \uBC1B\uC558\uC5B4\uC694"}),{headers:e}):(await P(_.user_id,10,"share",t),new Response(JSON.stringify({ok:!0,already:!1,points:10}),{headers:e}))}catch(n){return new Response(JSON.stringify({ok:!1,message:n.message}),{status:500,headers:e})}if(r==="/admin/reviews"&&i.method==="GET"){if(i.headers.get("Authorization")!==`Bearer ${t.ADMIN_SECRET}`)return new Response(JSON.stringify({ok:!1,message:"Unauthorized"}),{status:401,headers:e});try{let n=new URL(i.url),p=(n.searchParams.get("q")||"").trim(),_=Math.max(1,parseInt(n.searchParams.get("page")||"1")),c=Math.min(parseInt(n.searchParams.get("limit")||"20"),50),s=(_-1)*c,a=p?"WHERE u.nickname LIKE ? OR w.title_ko LIKE ?":"",d=p?[`%${p}%`,`%${p}%`]:[],[l,m]=await t.DB.batch([t.DB.prepare(`
          SELECT r.id, r.tmdb_id, r.score, r.text, r.emotions, r.likes, r.created_at,
                 u.nickname, w.title_ko, w.poster_path
          FROM reviews r
          JOIN users u ON r.user_id = u.id
          LEFT JOIN works w ON r.tmdb_id = w.tmdb_id
          ${a}
          ORDER BY r.created_at DESC
          LIMIT ? OFFSET ?
        `).bind(...d,c,s),t.DB.prepare(`
          SELECT COUNT(*) as cnt
          FROM reviews r
          JOIN users u ON r.user_id = u.id
          LEFT JOIN works w ON r.tmdb_id = w.tmdb_id
          ${a}
        `).bind(...d)]),u=l.results||[],E=m.results?.[0]?.cnt||0;return new Response(JSON.stringify({ok:!0,data:u,total:E,page:_,limit:c}),{headers:e})}catch(n){return new Response(JSON.stringify({ok:!1,message:n.message}),{status:500,headers:e})}}let o=r.match(/^\/admin\/reviews\/(\d+)$/);if(i.method==="DELETE"&&o){if(i.headers.get("Authorization")!==`Bearer ${t.ADMIN_SECRET}`)return new Response(JSON.stringify({ok:!1,message:"Unauthorized"}),{status:401,headers:e});try{let n=o[1],p=await t.DB.prepare("SELECT id, user_id FROM reviews WHERE id = ?").bind(n).first();return p?(await t.DB.prepare("DELETE FROM reviews WHERE id = ?").bind(n).run(),p.user_id&&f.waitUntil($(p.user_id,t)),new Response(JSON.stringify({ok:!0}),{headers:e})):new Response(JSON.stringify({ok:!1,message:"\uCC3E\uC744 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4"}),{status:404,headers:e})}catch(n){return new Response(JSON.stringify({ok:!1,message:n.message}),{status:500,headers:e})}}return null}async function ft(r,i,t,f,e,o){if(r==="/posts"&&i.method==="GET")try{let n=e.searchParams.get("board")||"free",p=parseInt(e.searchParams.get("page")||"1"),_=20,c=(p-1)*_,{results:s}=await t.DB.prepare(`
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
      `).bind(n,_,c).all(),a=await t.DB.prepare("SELECT COUNT(*) as cnt FROM posts WHERE board_type = ? AND is_hidden = 0").bind(n).first();return new Response(JSON.stringify({ok:!0,data:s,total:a?.cnt||0,page:p,limit:_}),{headers:o})}catch(n){return new Response(JSON.stringify({ok:!1,message:n.message}),{status:500,headers:o})}if(r.match(/^\/posts\/\d+$/)&&i.method==="GET")try{let n=parseInt(r.split("/")[2]);await t.DB.prepare("UPDATE posts SET view_count = view_count + 1 WHERE id = ?").bind(n).run();let p=await t.DB.prepare(`
        SELECT p.*, u.nickname, u.grade,
          gs.emoji_url as grade_emoji_url, gs.grade_name
        FROM posts p
        JOIN users u ON p.user_id = u.id
        LEFT JOIN grade_settings gs ON gs.grade_key = u.grade
        WHERE p.id = ? AND p.is_hidden = 0
      `).bind(n).first();return p?new Response(JSON.stringify({ok:!0,data:p}),{headers:o}):new Response(JSON.stringify({ok:!1,message:"Not found"}),{status:404,headers:o})}catch(n){return new Response(JSON.stringify({ok:!1,message:n.message}),{status:500,headers:o})}if(r==="/posts"&&i.method==="POST")try{let p=(i.headers.get("Authorization")||"").replace("Bearer ","").trim()||B(i);if(!p)return new Response(JSON.stringify({ok:!1,message:"\uB85C\uADF8\uC778 \uD544\uC694"}),{status:401,headers:o});let _=await t.DB.prepare("SELECT user_id FROM sessions WHERE id = ? AND expires_at > datetime('now')").bind(p).first();if(!_)return new Response(JSON.stringify({ok:!1,message:"\uC138\uC158 \uB9CC\uB8CC"}),{status:401,headers:o});let c=await i.json(),{board_type:s,title:a,content:d}=c;if(!["recommend","free","community"].includes(s))return new Response(JSON.stringify({ok:!1,message:"\uC62C\uBC14\uB978 \uAC8C\uC2DC\uD310\uC744 \uC120\uD0DD\uD574\uC8FC\uC138\uC694"}),{status:400,headers:o});if(!a||a.trim().length<2)return new Response(JSON.stringify({ok:!1,message:"\uC81C\uBAA9\uC740 2\uC790 \uC774\uC0C1 \uC785\uB825\uD574\uC8FC\uC138\uC694"}),{status:400,headers:o});if(a.trim().length>100)return new Response(JSON.stringify({ok:!1,message:"\uC81C\uBAA9\uC740 100\uC790 \uC774\uB0B4\uB85C \uC785\uB825\uD574\uC8FC\uC138\uC694"}),{status:400,headers:o});if(!d||d.trim().length<5)return new Response(JSON.stringify({ok:!1,message:"\uB0B4\uC6A9\uC740 5\uC790 \uC774\uC0C1 \uC785\uB825\uD574\uC8FC\uC138\uC694"}),{status:400,headers:o});let l=await t.DB.prepare("INSERT INTO posts (board_type, user_id, title, content) VALUES (?, ?, ?, ?)").bind(s,_.user_id,a.trim(),d.trim()).run();return f.waitUntil($(_.user_id,t)),new Response(JSON.stringify({ok:!0,id:l.meta?.last_row_id}),{headers:o})}catch(n){return new Response(JSON.stringify({ok:!1,message:n.message}),{status:500,headers:o})}if(r.match(/^\/posts\/\d+$/)&&i.method==="PATCH")try{let n=parseInt(r.split("/")[2]),_=(i.headers.get("Authorization")||"").replace("Bearer ","").trim()||B(i);if(!_)return new Response(JSON.stringify({ok:!1,message:"\uB85C\uADF8\uC778 \uD544\uC694"}),{status:401,headers:o});let c=await t.DB.prepare("SELECT user_id FROM sessions WHERE id = ? AND expires_at > datetime('now')").bind(_).first();if(!c)return new Response(JSON.stringify({ok:!1,message:"\uC138\uC158 \uB9CC\uB8CC"}),{status:401,headers:o});let s=await t.DB.prepare("SELECT user_id FROM posts WHERE id = ?").bind(n).first();if(!s)return new Response(JSON.stringify({ok:!1,message:"\uAC8C\uC2DC\uAE00 \uC5C6\uC74C"}),{status:404,headers:o});if(s.user_id!==c.user_id)return new Response(JSON.stringify({ok:!1,message:"\uAD8C\uD55C \uC5C6\uC74C"}),{status:403,headers:o});let a=await i.json(),{title:d,content:l}=a;return await t.DB.prepare("UPDATE posts SET title = ?, content = ?, updated_at = datetime('now') WHERE id = ?").bind(d.trim(),l.trim(),n).run(),new Response(JSON.stringify({ok:!0}),{headers:o})}catch(n){return new Response(JSON.stringify({ok:!1,message:n.message}),{status:500,headers:o})}if(r.match(/^\/posts\/\d+$/)&&i.method==="DELETE")try{let n=parseInt(r.split("/")[2]),_=(i.headers.get("Authorization")||"").replace("Bearer ","").trim()||B(i);if(!_)return new Response(JSON.stringify({ok:!1,message:"\uB85C\uADF8\uC778 \uD544\uC694"}),{status:401,headers:o});let c=await t.DB.prepare("SELECT user_id FROM sessions WHERE id = ? AND expires_at > datetime('now')").bind(_).first();if(!c)return new Response(JSON.stringify({ok:!1,message:"\uC138\uC158 \uB9CC\uB8CC"}),{status:401,headers:o});let s=await t.DB.prepare("SELECT user_id FROM posts WHERE id = ?").bind(n).first();return s?s.user_id!==c.user_id?new Response(JSON.stringify({ok:!1,message:"\uAD8C\uD55C \uC5C6\uC74C"}),{status:403,headers:o}):(await t.DB.prepare("DELETE FROM posts WHERE id = ?").bind(n).run(),f.waitUntil($(c.user_id,t)),new Response(JSON.stringify({ok:!0}),{headers:o})):new Response(JSON.stringify({ok:!1,message:"\uAC8C\uC2DC\uAE00 \uC5C6\uC74C"}),{status:404,headers:o})}catch(n){return new Response(JSON.stringify({ok:!1,message:n.message}),{status:500,headers:o})}if(r.match(/^\/posts\/\d+\/like$/)&&i.method==="POST")try{let n=parseInt(r.split("/")[2]),p=await t.DB.prepare("SELECT user_id FROM posts WHERE id = ?").bind(n).first();return await t.DB.prepare("UPDATE posts SET like_count = like_count + 1 WHERE id = ?").bind(n).run(),p?.user_id&&(await t.DB.prepare("UPDATE users SET total_likes_received = total_likes_received + 1 WHERE id = ?").bind(p.user_id).run(),f.waitUntil($(p.user_id,t))),new Response(JSON.stringify({ok:!0}),{headers:o})}catch(n){return new Response(JSON.stringify({ok:!1,message:n.message}),{status:500,headers:o})}return null}async function gt(r,i){let t=await r.DB.prepare("SELECT media_type FROM works WHERE tmdb_id = ?").bind(i).first();if(!t)return;let f=t.media_type==="movie"?"movie":"tv",e=new Set,{results:o}=await r.DB.prepare(`
    SELECT platform FROM rankings
    WHERE tmdb_id = ?
      AND date = (SELECT value FROM app_settings WHERE key = 'latest_ranking_date')
  `).bind(i).all();o.forEach(c=>e.add(c.platform));let n=[[/netflix/i,"netflix"],[/tving/i,"tving"],[/disney/i,"disney"],[/coupang/i,"coupang"],[/wavve/i,"wavve"],[/watcha/i,"watcha"]];try{if(f==="tv"&&!e.has("coupang")){let s=await fetch(`https://api.themoviedb.org/3/tv/${i}?api_key=${r.TMDB_API_KEY}`);s.ok&&((await s.json()).networks||[]).some(d=>d.id===5169)&&e.add("coupang")}let c=await fetch(`https://api.themoviedb.org/3/${f}/${i}/watch/providers?api_key=${r.TMDB_API_KEY}`);if(c.ok){let s=await c.json(),a=s.results&&s.results.KR||{};[...a.flatrate||[],...a.rent||[],...a.buy||[]].forEach(l=>{let m=n.find(([u])=>u.test(l.provider_name||""));m&&e.add(m[1])})}}catch{}let{results:p}=await r.DB.prepare("SELECT ott_key, action FROM work_ott_overrides WHERE tmdb_id = ?").bind(i).all();p.forEach(c=>{c.action==="add"?e.add(c.ott_key):c.action==="remove"&&e.delete(c.ott_key)});let _=[r.DB.prepare("DELETE FROM work_ott WHERE tmdb_id = ?").bind(i)];e.forEach(c=>{_.push(r.DB.prepare("INSERT INTO work_ott (tmdb_id, ott_key) VALUES (?, ?)").bind(i,c))}),_.push(r.DB.prepare("UPDATE works SET ott_updated_at = datetime('now') WHERE tmdb_id = ?").bind(i)),await r.DB.batch(_)}async function et(r,i,t,f,e){let o=r.match(/^\/work-ott\/(\d+)$/);if(o&&i.method==="GET"){let s=parseInt(o[1]);try{let{results:a}=await t.DB.prepare(`SELECT id, tmdb_id, ott_key, action, created_at
         FROM work_ott_overrides
         WHERE tmdb_id = ?
         ORDER BY created_at DESC`).bind(s).all();return new Response(JSON.stringify({ok:!0,data:a||[]}),{headers:e})}catch(a){return new Response(JSON.stringify({ok:!1,error:a.message}),{status:500,headers:e})}}if(r==="/work-ott"&&i.method==="POST"){if(!D(i,t))return new Response(JSON.stringify({ok:!1,error:"Unauthorized"}),{status:401,headers:e});try{let s=await i.json(),{tmdb_id:a,ott_key:d,action:l}=s;if(!a||!d||!l)return new Response(JSON.stringify({ok:!1,error:"tmdb_id, ott_key, action \uD544\uC218"}),{status:400,headers:e});if(!["add","remove"].includes(l))return new Response(JSON.stringify({ok:!1,error:"action\uC740 'add' \uB610\uB294 'remove'\uB9CC \uD5C8\uC6A9"}),{status:400,headers:e});await t.DB.prepare(`INSERT INTO work_ott_overrides (tmdb_id, ott_key, action)
         VALUES (?, ?, ?)
         ON CONFLICT(tmdb_id, ott_key)
         DO UPDATE SET action = excluded.action,
                       created_at = datetime('now')`).bind(a,d,l).run();try{await gt(t,a)}catch{}return new Response(JSON.stringify({ok:!0}),{headers:e})}catch(s){return new Response(JSON.stringify({ok:!1,error:s.message}),{status:500,headers:e})}}let n=r.match(/^\/work-ott\/(\d+)$/);if(n&&i.method==="DELETE"){if(!D(i,t))return new Response(JSON.stringify({ok:!1,error:"Unauthorized"}),{status:401,headers:e});let s=parseInt(n[1]);try{let a=await t.DB.prepare("SELECT tmdb_id FROM work_ott_overrides WHERE id = ?").bind(s).first();if(await t.DB.prepare("DELETE FROM work_ott_overrides WHERE id = ?").bind(s).run(),a&&a.tmdb_id)try{await gt(t,a.tmdb_id)}catch{}return new Response(JSON.stringify({ok:!0}),{headers:e})}catch(a){return new Response(JSON.stringify({ok:!1,error:a.message}),{status:500,headers:e})}}if(r==="/admin/title-map"&&i.method==="GET"){if(!D(i,t))return new Response(JSON.stringify({ok:!1,message:"Unauthorized"}),{status:401,headers:e});try{let s=parseInt(f.searchParams.get("page")||"1"),a=50,d=(s-1)*a,{results:l}=await t.DB.prepare("SELECT * FROM title_map ORDER BY created_at DESC LIMIT ? OFFSET ?").bind(a,d).all();return new Response(JSON.stringify({ok:!0,data:l}),{headers:e})}catch(s){return new Response(JSON.stringify({ok:!1,message:s.message}),{status:500,headers:e})}}if(r==="/admin/rankings"&&i.method==="POST"){if(!D(i,t))return new Response(JSON.stringify({ok:!1,message:"Unauthorized"}),{status:401,headers:e});try{let s=await i.json(),{platform:a,category_slot:d,date:l,tmdb_id:m,rank:u,title_ko:E,title_en:w,media_type:g,is_manual:y}=s;if(!a||!d||!l||!m||!E)return new Response(JSON.stringify({ok:!1,message:"platform, category_slot, date, tmdb_id, title_ko \uD544\uC218"}),{status:400,headers:e});let k=null,O=E||null,R=w||null,S=null,h=null,b=null,N=g==="tv"||g==="movie"?g:null;try{let A=N?[N]:["tv","movie"];for(let L of A){let C=await fetch(`https://api.themoviedb.org/3/${L}/${m}?language=ko-KR&api_key=${t.TMDB_API_KEY}`);if(!C.ok)continue;let I=await C.json();if(!(!I.poster_path&&!I.name&&!I.title)){if(k=I.poster_path||null,S=parseInt((I.first_air_date||I.release_date||"").slice(0,4))||null,b=I.vote_average?parseFloat(I.vote_average.toFixed(1)):null,h=(I.genres||[]).map(F=>F.name).join(", ")||null,N||(N=L),O||(O=I.name||I.title||null),!R){let F=await fetch(`https://api.themoviedb.org/3/${L}/${m}?language=en-US&api_key=${t.TMDB_API_KEY}`);if(F.ok){let H=await F.json(),M=H.original_title||H.original_name||"",W=H.title||H.name||"";R=/[\uAC00-\uD7A3]/.test(M)?W:M||W}}break}}}catch{}await t.DB.prepare(`
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
      `).bind(parseInt(m),O||"",R||"",k,N,O||null,R||null,k,N).run();let T=parseInt(u)||null;return T||(T=((await t.DB.prepare("SELECT MAX(rank) as max_rank FROM rankings WHERE platform = ? AND category_slot = ? AND date = ?").bind(a,d,l).first())?.max_rank||0)+1),await t.DB.prepare(`
        INSERT INTO rankings
          (platform, category_slot, category, date, rank, tmdb_id,
           title_ko, title_en, poster_path, release_year, genre, tmdb_rating,
           is_manual, source_name)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).bind(a,d,d,l,-T,parseInt(m),O||"",R||"",k,S,h,b,y?1:0,d).run(),await t.DB.prepare("UPDATE rankings SET rank = ? WHERE platform = ? AND category_slot = ? AND date = ? AND rank = ?").bind(T,a,d,l,-T).run(),R&&O&&await t.DB.prepare(`
          INSERT INTO title_map (title_en, title_ko, tmdb_id)
          VALUES (?, ?, ?)
          ON CONFLICT(title_en) DO UPDATE SET
            title_ko = excluded.title_ko,
            tmdb_id  = COALESCE(excluded.tmdb_id, tmdb_id)
        `).bind(R.trim(),O.trim(),parseInt(m)).run(),await t.DB.prepare("INSERT INTO admin_logs (action, platform, category_slot, target_id, after_value) VALUES ('ranking_add', ?, ?, ?, ?)").bind(a,d,String(m),JSON.stringify({rank:T,title_ko:O,date:l})).run(),new Response(JSON.stringify({ok:!0,rank:T,poster_path:k,title_ko:O,title_en:R}),{headers:e})}catch(s){return new Response(JSON.stringify({ok:!1,message:s.message}),{status:500,headers:e})}}if(r==="/admin/rankings"&&i.method==="GET"){if(!D(i,t))return new Response(JSON.stringify({ok:!1,message:"Unauthorized"}),{status:401,headers:e});let s=f.searchParams.get("date"),a=f.searchParams.get("manual"),d,l;a==="true"?(d="SELECT * FROM rankings WHERE date = 'manual' ORDER BY platform, category_slot, rank",l=null):s?(d="SELECT * FROM rankings WHERE date = ? ORDER BY platform, category_slot, rank",l=s):(d="SELECT * FROM rankings WHERE date = (SELECT value FROM app_settings WHERE key = 'latest_ranking_date') ORDER BY platform, category_slot, rank",l=null);let{results:m}=l?await t.DB.prepare(d).bind(l).all():await t.DB.prepare(d).all();return new Response(JSON.stringify({ok:!0,data:m}),{headers:e})}if(r==="/admin/fix"&&i.method==="POST"){if(!D(i,t))return new Response(JSON.stringify({ok:!1,message:"Unauthorized"}),{status:401,headers:e});try{let s=await i.json(),{id:a,tmdb_id:d,title_ko:l,title_en:m,delete_duplicates:u,media_type:E}=s,w=s.season!==void 0?s.season:void 0,g=s.poster_path||null;if(!a)return new Response(JSON.stringify({ok:!1,message:"id required"}),{status:400,headers:e});let y=null,k=l||null,O=m||null,R=await t.DB.prepare("SELECT title_ko, title_en, poster_path FROM rankings WHERE id = ?").bind(parseInt(a)).first();if(d)try{let N=E==="movie"?["movie"]:E==="tv"?["tv"]:["tv","movie"];for(let T of N){let A=await fetch(`https://api.themoviedb.org/3/${T}/${d}?language=ko-KR&api_key=${t.TMDB_API_KEY}`);if(!A.ok)continue;let L=await A.json();if(!(!L.poster_path&&!L.name&&!L.title)){if(y=L.poster_path||null,k||(k=L.name||L.title||null),!O){let C=await fetch(`https://api.themoviedb.org/3/${T}/${d}?language=en-US&api_key=${t.TMDB_API_KEY}`);if(C.ok){let I=await C.json(),F=I.original_title||I.original_name||"",H=I.title||I.name||"";O=/[\uAC00-\uD7A3]/.test(F)?H:F||H}}break}}}catch{}g&&(y=g);let S=w!==void 0?w!==null?parseInt(w):null:void 0;if(await t.DB.prepare(`
        UPDATE rankings
        SET tmdb_id     = COALESCE(?, tmdb_id),
            title_ko    = COALESCE(?, title_ko),
            title_en    = COALESCE(?, title_en),
            poster_path = COALESCE(?, poster_path),
            season      = ${S!==void 0?"?":"season"},
            is_manual   = 1
        WHERE id = ?
      `).bind(d?parseInt(d):null,k,O,y,...S!==void 0?[S]:[],parseInt(a)).run(),d){u&&(O&&await t.DB.prepare("DELETE FROM works WHERE title_en = ? AND tmdb_id != ?").bind(O,parseInt(d)).run(),k&&/[\uAC00-\uD7A3]/.test(k)&&await t.DB.prepare("DELETE FROM works WHERE title_ko = ? AND tmdb_id != ?").bind(k,parseInt(d)).run(),await t.DB.prepare("INSERT INTO admin_logs (action, target_id, memo) VALUES ('works_delete', ?, ?)").bind(String(d),`\uC911\uBCF5 \uC0AD\uC81C: title_en="${O}" title_ko="${k}"`).run());let N=E==="tv"||E==="movie"?E:null,T=g?null:y;await t.DB.prepare(`
          INSERT INTO works (tmdb_id, title_ko, title_en, poster_path, media_type)
          VALUES (?, ?, ?, ?, ?)
          ON CONFLICT(tmdb_id) DO UPDATE SET
            title_ko    = COALESCE(?, title_ko),
            title_en    = COALESCE(NULLIF(?, ''), title_en),
            poster_path = COALESCE(?, poster_path),
            media_type  = COALESCE(?, media_type),
            updated_at  = datetime('now')
        `).bind(parseInt(d),k||"",O||"",T,N,k||null,O||null,T,N).run()}let h=O||k||"",b=k||O||"";return h&&b&&d&&await t.DB.prepare(`
          INSERT INTO title_map (title_en, title_ko, tmdb_id)
          VALUES (?, ?, ?)
          ON CONFLICT(title_en) DO UPDATE SET
            title_ko = excluded.title_ko,
            tmdb_id  = COALESCE(excluded.tmdb_id, tmdb_id)
        `).bind(h.trim(),b.trim(),parseInt(d)).run(),new Response(JSON.stringify({ok:!0,poster_path:y,title_ko:k,title_en:O}),{headers:e})}catch(s){return new Response(JSON.stringify({ok:!1,message:s.message}),{status:500,headers:e})}}if(r==="/admin/unfix"&&i.method==="POST"){if(!D(i,t))return new Response(JSON.stringify({ok:!1,message:"Unauthorized"}),{status:401,headers:e});let s=await i.json(),{id:a}=s;return await t.DB.prepare("UPDATE rankings SET is_manual = 0 WHERE id = ?").bind(a).run(),new Response(JSON.stringify({ok:!0}),{headers:e})}let p=r.match(/^\/admin\/rankings\/(\d+)$/);if(p&&i.method==="PATCH"){if(!D(i,t))return new Response(JSON.stringify({ok:!1,message:"Unauthorized"}),{status:401,headers:e});try{let s=parseInt(p[1]),{is_manual:a}=await i.json();if(a!==0&&a!==2)return new Response(JSON.stringify({ok:!1,message:"is_manual \uAC12\uC740 0(\uD574\uC81C) \uB610\uB294 2(\uD06C\uB864\uB9C1\uACE0\uC815)\uB9CC \uD5C8\uC6A9\uB429\uB2C8\uB2E4."}),{status:400,headers:e});let d=await t.DB.prepare("SELECT id, platform, category_slot, title_ko FROM rankings WHERE id = ?").bind(s).first();return d?(await t.DB.prepare("UPDATE rankings SET is_manual = ? WHERE id = ?").bind(a,s).run(),await t.DB.prepare("INSERT INTO admin_logs (action, platform, category_slot, target_id, after_value) VALUES ('crawl_lock', ?, ?, ?, ?)").bind(d.platform,d.category_slot,String(s),JSON.stringify({is_manual:a,title_ko:d.title_ko})).run(),new Response(JSON.stringify({ok:!0,is_manual:a}),{headers:e})):new Response(JSON.stringify({ok:!1,message:"\uD574\uB2F9 \uB7AD\uD0B9\uC744 \uCC3E\uC744 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4."}),{status:404,headers:e})}catch(s){return new Response(JSON.stringify({ok:!1,message:s.message}),{status:500,headers:e})}}let _=r.match(/^\/admin\/rankings\/(\d+)$/);if(_&&i.method==="DELETE"){if(!D(i,t))return new Response(JSON.stringify({ok:!1,message:"Unauthorized"}),{status:401,headers:e});try{let s=parseInt(_[1]),a=await t.DB.prepare("SELECT id, tmdb_id, platform, category_slot, title_ko, rank, is_manual FROM rankings WHERE id = ?").bind(s).first();if(!a)return new Response(JSON.stringify({ok:!1,message:"\uD574\uB2F9 \uB7AD\uD0B9\uC744 \uCC3E\uC744 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4."}),{status:404,headers:e});await t.DB.prepare("DELETE FROM rankings WHERE id = ?").bind(s).run(),await t.DB.prepare("INSERT INTO admin_logs (action, platform, category_slot, target_id, after_value) VALUES ('ranking_delete', ?, ?, ?, ?)").bind(a.platform,a.category_slot,String(s),JSON.stringify({title_ko:a.title_ko,rank:a.rank,is_manual:a.is_manual})).run();let d=null;if(a.tmdb_id){let{results:l}=await t.DB.prepare(`
          SELECT id, date FROM rankings
          WHERE tmdb_id = ? AND platform = ? AND category_slot = ? AND is_manual = 2
          ORDER BY date DESC
        `).bind(a.tmdb_id,a.platform,a.category_slot).all();l.length&&(d={count:l.length,latest_date:l[0].date,message:`\uC774 \uC791\uD488\uC740 \uB0A0\uC9DC\uACE0\uC815(\u{1F4CC})\uB41C \uBC84\uC804\uC774 ${l.length}\uAC74 \uB354 \uB0A8\uC544\uC788\uC5B4, \uB2E4\uC74C \uD06C\uB864\uB9C1 \uB54C \uB2E4\uC2DC \uB098\uD0C0\uB0A0 \uC218 \uC788\uC2B5\uB2C8\uB2E4. \uC644\uC804\uD788 \uB9C9\uC73C\uB824\uBA74 \uD574\uB2F9 \uD589\uC758 \uB0A0\uC9DC\uACE0\uC815\uC744 \uD574\uC81C\uD558\uC138\uC694(\uAE30\uB85D\uC740 \uC0AD\uC81C\uB418\uC9C0 \uC54A\uACE0 \uB0A8\uC2B5\uB2C8\uB2E4).`})}return new Response(JSON.stringify({ok:!0,pinned_warning:d}),{headers:e})}catch(s){return new Response(JSON.stringify({ok:!1,message:s.message}),{status:500,headers:e})}}if(r==="/admin/categories"&&i.method==="GET"){if(!D(i,t))return new Response(JSON.stringify({ok:!1,message:"Unauthorized"}),{status:401,headers:e});try{let s=f.searchParams.get("platform"),a="SELECT * FROM ott_categories",d=[];s&&(a+=" WHERE platform = ?",d.push(s)),a+=" ORDER BY platform, category_slot";let{results:l}=d.length?await t.DB.prepare(a).bind(...d).all():await t.DB.prepare(a).all();return new Response(JSON.stringify({ok:!0,data:l}),{headers:e})}catch(s){return new Response(JSON.stringify({ok:!1,message:s.message}),{status:500,headers:e})}}if(r.match(/^\/admin\/categories\/\d+$/)&&i.method==="PATCH"){if(!D(i,t))return new Response(JSON.stringify({ok:!1,message:"Unauthorized"}),{status:401,headers:e});try{let s=parseInt(r.split("/")[3]),a=await i.json(),{display_name:d,crawl_limit:l,main_limit:m,platform_limit:u,is_active:E,main_section:w,main_order:g,platform_section:y,platform_order:k,memo_label:O,hot100_eligible:R,hot100_weight:S,person_section:h,person_order:b,person_limit:N}=a;return await t.DB.prepare(`
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
      `).bind(d??null,l??null,m??null,u??null,E??null,w===void 0?"__SKIP__":"__SET__",w===void 0?null:w||null,g===void 0?"__SKIP__":"__SET__",g===void 0?null:g??0,y===void 0?"__SKIP__":"__SET__",y===void 0?null:y||null,k===void 0?"__SKIP__":"__SET__",k===void 0?null:k??0,O===void 0?"__SKIP__":"__SET__",O===void 0?null:O||null,R===void 0?"__SKIP__":"__SET__",R===void 0?null:R??0,S??null,h===void 0?"__SKIP__":"__SET__",h===void 0?null:h||null,b===void 0?"__SKIP__":"__SET__",b===void 0?null:b??0,N??null,s).run(),await t.DB.prepare("INSERT INTO admin_logs (action, target_id, after_value) VALUES ('category_setting', ?, ?)").bind(String(s),JSON.stringify(a)).run(),new Response(JSON.stringify({ok:!0}),{headers:e})}catch(s){return new Response(JSON.stringify({ok:!1,message:s.message}),{status:500,headers:e})}}if(r==="/admin/categories"&&i.method==="POST"){if(!D(i,t))return new Response(JSON.stringify({ok:!1,message:"Unauthorized"}),{status:401,headers:e});try{let s=await i.json(),{platform:a,category_slot:d,source_name:l,display_name:m,crawl_limit:u,main_limit:E,platform_limit:w,is_active:g}=s;if(!a||!d||!l)return new Response(JSON.stringify({ok:!1,message:"platform, category_slot, source_name required"}),{status:400,headers:e});let k=((await t.DB.prepare("SELECT MAX(table_index) as max_idx FROM ott_categories WHERE platform = ?").bind(a).first())?.max_idx??-1)+1;await t.DB.prepare(`
        INSERT INTO ott_categories
          (platform, category_slot, table_index, source_name, display_name,
           crawl_limit, main_limit, platform_limit, is_active)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(platform, category_slot) DO NOTHING
      `).bind(a,d,k,l,m||l,u||20,E||10,w||20,g??1).run();let O=await t.DB.prepare("SELECT * FROM ott_categories WHERE platform = ? AND category_slot = ?").bind(a,d).first();return await t.DB.prepare("INSERT INTO admin_logs (action, platform, category_slot, after_value) VALUES ('category_create', ?, ?, ?)").bind(a,d,JSON.stringify(s)).run(),new Response(JSON.stringify({ok:!0,data:O}),{headers:e})}catch(s){return new Response(JSON.stringify({ok:!1,message:s.message}),{status:500,headers:e})}}if(r==="/admin/review-queue/count"&&i.method==="GET"){if(!D(i,t))return new Response(JSON.stringify({ok:!1,message:"Unauthorized"}),{status:401,headers:e});try{let s=await t.DB.prepare("SELECT COUNT(*) as count FROM review_queue WHERE status = 'pending'").first();return new Response(JSON.stringify({ok:!0,count:s?.count||0}),{headers:e})}catch(s){return new Response(JSON.stringify({ok:!1,message:s.message}),{status:500,headers:e})}}if(r==="/admin/review-queue"&&i.method==="GET"){if(!D(i,t))return new Response(JSON.stringify({ok:!1,message:"Unauthorized"}),{status:401,headers:e});try{let s=f.searchParams.get("status")||"pending",a=f.searchParams.get("platform"),d="SELECT * FROM review_queue WHERE status = ?",l=[s];a&&(d+=" AND platform = ?",l.push(a)),d+=" ORDER BY crawled_date DESC, platform, category_slot, rank";let{results:m}=await t.DB.prepare(d).bind(...l).all();return new Response(JSON.stringify({ok:!0,data:m}),{headers:e})}catch(s){return new Response(JSON.stringify({ok:!1,message:s.message}),{status:500,headers:e})}}if(r.match(/^\/admin\/review-queue\/\d+\/resolve$/)&&i.method==="POST"){if(!D(i,t))return new Response(JSON.stringify({ok:!1,message:"Unauthorized"}),{status:401,headers:e});try{let s=parseInt(r.split("/")[3]),a=await i.json(),{tmdb_id:d,title_ko:l,title_en:m}=a;if(!d)return new Response(JSON.stringify({ok:!1,message:"tmdb_id required"}),{status:400,headers:e});let u=await t.DB.prepare("SELECT * FROM review_queue WHERE id = ?").bind(s).first();if(!u)return new Response(JSON.stringify({ok:!1,message:"Queue item not found"}),{status:404,headers:e});let E=null,w=l,g=m;try{for(let k of["tv","movie"]){let O=await fetch(`https://api.themoviedb.org/3/${k}/${d}?language=ko-KR&api_key=${t.TMDB_API_KEY}`);if(O.ok){let R=await O.json();if(R.name||R.title){E=R.poster_path||null,w||(w=R.name||R.title);break}}}if(!g)for(let k of["tv","movie"]){let O=await fetch(`https://api.themoviedb.org/3/${k}/${d}?language=en-US&api_key=${t.TMDB_API_KEY}`);if(O.ok){let R=await O.json();if(R.name||R.title){g=R.title||R.name;break}}}}catch{}if(a.delete_duplicates===!0&&(g||u.title_en)){let k=g||u.title_en;await t.DB.prepare("DELETE FROM works WHERE title_en = ? AND tmdb_id != ?").bind(k,parseInt(d)).run(),await t.DB.prepare("INSERT INTO admin_logs (action, target_id, before_value, memo) VALUES ('works_delete', ?, ?, ?)").bind(String(d),JSON.stringify({title_en:k}),`\uC911\uBCF5 \uC0AD\uC81C: title_en="${k}" tmdb_id!=${d}`).run()}return await t.DB.prepare(`
        INSERT INTO works (tmdb_id, title_ko, title_en, poster_path, match_source, confidence_score)
        VALUES (?, ?, ?, ?, 'admin', 100)
        ON CONFLICT(tmdb_id) DO UPDATE SET
          title_ko         = COALESCE(?, title_ko),
          title_en         = COALESCE(NULLIF(?, ''), title_en),
          poster_path      = COALESCE(?, poster_path),
          match_source     = 'admin',
          confidence_score = 100,
          updated_at       = datetime('now')
      `).bind(parseInt(d),w||"",g||"",E,w||null,g||null,E).run(),await t.DB.prepare(`
        UPDATE rankings SET
          tmdb_id     = ?,
          title_ko    = COALESCE(?, title_ko),
          title_en    = COALESCE(?, title_en),
          poster_path = COALESCE(?, poster_path),
          is_manual   = 1
        WHERE platform = ? AND category_slot = ? AND rank = ? AND date = ?
      `).bind(parseInt(d),w||null,g||null,E,u.platform,u.category_slot,u.rank,u.crawled_date).run(),await t.DB.prepare(`
        UPDATE review_queue SET
          status           = 'resolved',
          resolved_tmdb_id = ?,
          resolved_at      = datetime('now')
        WHERE id = ?
      `).bind(parseInt(d),s).run(),await t.DB.prepare("INSERT INTO admin_logs (action, platform, category_slot, target_id, after_value) VALUES ('queue_resolve', ?, ?, ?, ?)").bind(u.platform,u.category_slot,String(d),JSON.stringify({tmdb_id:d,title_ko:w,title_en:g})).run(),new Response(JSON.stringify({ok:!0,poster_path:E,title_ko:w,title_en:g}),{headers:e})}catch(s){return new Response(JSON.stringify({ok:!1,message:s.message}),{status:500,headers:e})}}if(r==="/admin/rank-override"&&i.method==="POST"){if(!D(i,t))return new Response(JSON.stringify({ok:!1,message:"Unauthorized"}),{status:401,headers:e});try{let s=await i.json(),{platform:a,category_slot:d,date:l,tmdb_id:m,original_rank:u,override_rank:E,reason:w}=s;return!a||!d||!l||!m||!E?new Response(JSON.stringify({ok:!1,message:"\uD544\uC218 \uD30C\uB77C\uBBF8\uD130 \uB204\uB77D"}),{status:400,headers:e}):(await t.DB.prepare(`
        INSERT INTO rank_overrides
          (platform, category_slot, date, tmdb_id, original_rank, override_rank, reason)
        VALUES (?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(platform, category_slot, date, tmdb_id) DO UPDATE SET
          override_rank = excluded.override_rank,
          reason        = excluded.reason,
          updated_at    = datetime('now')
      `).bind(a,d,l,parseInt(m),u||0,parseInt(E),w||null).run(),await t.DB.prepare("INSERT INTO admin_logs (action, platform, category_slot, target_id, before_value, after_value) VALUES ('rank_override', ?, ?, ?, ?, ?)").bind(a,d,String(m),JSON.stringify({rank:u}),JSON.stringify({rank:E,reason:w})).run(),new Response(JSON.stringify({ok:!0}),{headers:e}))}catch(s){return new Response(JSON.stringify({ok:!1,message:s.message}),{status:500,headers:e})}}if(r==="/admin/rank-override"&&i.method==="DELETE"){if(!D(i,t))return new Response(JSON.stringify({ok:!1,message:"Unauthorized"}),{status:401,headers:e});try{let s=await i.json(),{platform:a,category_slot:d,date:l,tmdb_id:m}=s;return await t.DB.prepare("DELETE FROM rank_overrides WHERE platform = ? AND category_slot = ? AND date = ? AND tmdb_id = ?").bind(a,d,l,parseInt(m)).run(),new Response(JSON.stringify({ok:!0}),{headers:e})}catch(s){return new Response(JSON.stringify({ok:!1,message:s.message}),{status:500,headers:e})}}if(r.match(/^\/admin\/works\/\d+$/)&&i.method==="GET"){if(!D(i,t))return new Response(JSON.stringify({ok:!1,message:"Unauthorized"}),{status:401,headers:e});try{let s=parseInt(r.split("/")[3]),a=await t.DB.prepare("SELECT * FROM works WHERE tmdb_id = ?").bind(s).first();return a?new Response(JSON.stringify({ok:!0,data:a}),{headers:e}):new Response(JSON.stringify({ok:!1,message:"Not found"}),{status:404,headers:e})}catch(s){return new Response(JSON.stringify({ok:!1,message:s.message}),{status:500,headers:e})}}if(r==="/admin/works"&&i.method==="GET"){if(!D(i,t))return new Response(JSON.stringify({ok:!1,message:"Unauthorized"}),{status:401,headers:e});try{let s=f.searchParams.get("q")||"",a=f.searchParams.get("filter")||"",d=f.searchParams.get("date")||"",l=f.searchParams.get("sort")||"recent",m=parseInt(f.searchParams.get("page")||"1"),u=50,E=(m-1)*u,w=l==="updated"?"updated_at DESC, id DESC":"COALESCE(created_at, updated_at) DESC, id DESC",g,y;a==="new_match"&&d?(g=`SELECT * FROM works WHERE first_matched_date = ? AND match_source IN ('auto_claude', 'auto_tmdb') ORDER BY ${w} LIMIT ? OFFSET ?`,y=[d,u,E]):a==="adult_confirmed"&&s?(g=`SELECT * FROM works WHERE adult_flag = 1 AND (title_ko LIKE ? OR title_en LIKE ?) ORDER BY ${w} LIMIT ? OFFSET ?`,y=[`%${s}%`,`%${s}%`,u,E]):a==="adult_confirmed"?(g=`SELECT * FROM works WHERE adult_flag = 1 ORDER BY ${w} LIMIT ? OFFSET ?`,y=[u,E]):s?(g=`SELECT * FROM works WHERE title_ko LIKE ? OR title_en LIKE ? ORDER BY ${w} LIMIT ? OFFSET ?`,y=[`%${s}%`,`%${s}%`,u,E]):(g=`SELECT * FROM works ORDER BY ${w} LIMIT ? OFFSET ?`,y=[u,E]);let{results:k}=await t.DB.prepare(g).bind(...y).all();return new Response(JSON.stringify({ok:!0,data:k}),{headers:e})}catch(s){return new Response(JSON.stringify({ok:!1,message:s.message}),{status:500,headers:e})}}if(r.match(/^\/admin\/works\/\d+$/)&&i.method==="PATCH"){if(!D(i,t))return new Response(JSON.stringify({ok:!1,message:"Unauthorized"}),{status:401,headers:e});try{let s=parseInt(r.split("/")[3]),a=await i.json(),{title_ko:d,title_en:l,poster_path:m,delete_duplicates:u,media_type:E,mbti_tags:w}=a,g=E==="tv"||E==="movie"?E:null,y=w!==void 0,k=y?w||null:void 0,O=await t.DB.prepare("SELECT title_ko, title_en, poster_path, media_type FROM works WHERE tmdb_id = ?").bind(s).first();if(u&&(l||O?.title_en)){let R=l||O?.title_en;await t.DB.prepare("DELETE FROM works WHERE title_en = ? AND tmdb_id != ?").bind(R,s).run(),await t.DB.prepare("INSERT INTO admin_logs (action, target_id, before_value, memo) VALUES ('works_delete', ?, ?, ?)").bind(String(s),JSON.stringify({title_en:R}),`\uC911\uBCF5 \uC0AD\uC81C: title_en="${R}" tmdb_id!=${s}`).run()}return await t.DB.prepare(`
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
      `).bind(d||null,l||null,m||null,g,...y?[k]:[],s).run(),await t.DB.prepare("INSERT INTO admin_logs (action, target_id, before_value, after_value) VALUES ('works_update', ?, ?, ?)").bind(String(s),JSON.stringify(O),JSON.stringify(a)).run(),new Response(JSON.stringify({ok:!0}),{headers:e})}catch(s){return new Response(JSON.stringify({ok:!1,message:s.message}),{status:500,headers:e})}}if(r.match(/^\/admin\/works\/\d+\/hero-backdrop$/)&&i.method==="PATCH"){if(!D(i,t))return new Response(JSON.stringify({ok:!1,message:"Unauthorized"}),{status:401,headers:e});try{let s=parseInt(r.split("/")[3]),a=await i.json(),{backdrop_path:d,hero_title_baked_in:l}=a,m=l===void 0?null:l?1:0;return await t.DB.prepare("UPDATE works SET hero_backdrop_path = ?, hero_title_baked_in = COALESCE(?, hero_title_baked_in) WHERE tmdb_id = ?").bind(d||null,m,s).run(),new Response(JSON.stringify({ok:!0}),{headers:e})}catch(s){return new Response(JSON.stringify({ok:!1,message:s.message}),{status:500,headers:e})}}if(r.match(/^\/admin\/works\/\d+\/hero-upload$/)&&i.method==="PUT"){if(!D(i,t))return new Response(JSON.stringify({ok:!1,message:"Unauthorized"}),{status:401,headers:e});try{let s=parseInt(r.split("/")[3]),a=i.headers.get("Content-Type")||"image/jpeg",l={"image/jpeg":"jpg","image/png":"png","image/webp":"webp"}[a]||"jpg",m=`hero/${s}-${Date.now()}.${l}`;await t.IMAGES.put(m,i.body,{httpMetadata:{contentType:a}});let u=`https://img.ottrank.kr/${m}`,w=new URL(i.url).searchParams.get("baked_in")!=="0";return await t.DB.prepare("UPDATE works SET hero_custom_image_url = ?, hero_title_baked_in = ? WHERE tmdb_id = ?").bind(u,w?1:0,s).run(),new Response(JSON.stringify({ok:!0,url:u}),{headers:e})}catch(s){return new Response(JSON.stringify({ok:!1,message:s.message}),{status:500,headers:e})}}if(r.match(/^\/admin\/works\/\d+\/hero-upload$/)&&i.method==="DELETE"){if(!D(i,t))return new Response(JSON.stringify({ok:!1,message:"Unauthorized"}),{status:401,headers:e});try{let s=parseInt(r.split("/")[3]),a=await t.DB.prepare("SELECT hero_custom_image_url FROM works WHERE tmdb_id = ?").bind(s).first();if(a?.hero_custom_image_url){let d=a.hero_custom_image_url.replace("https://img.ottrank.kr/","");try{await t.IMAGES.delete(d)}catch{}}return await t.DB.prepare("UPDATE works SET hero_custom_image_url = NULL WHERE tmdb_id = ?").bind(s).run(),new Response(JSON.stringify({ok:!0}),{headers:e})}catch(s){return new Response(JSON.stringify({ok:!1,message:s.message}),{status:500,headers:e})}}if(r.match(/^\/admin\/works\/\d+\/adult-flag$/)&&i.method==="PATCH"){if(!D(i,t))return new Response(JSON.stringify({ok:!1,message:"Unauthorized"}),{status:401,headers:e});try{let s=parseInt(r.split("/")[3]),d=(await i.json()).adult_flag===1?1:null;return d===1?await t.DB.prepare("UPDATE works SET adult_flag = ?, media_type = 'movie' WHERE tmdb_id = ?").bind(d,s).run():await t.DB.prepare("UPDATE works SET adult_flag = ? WHERE tmdb_id = ?").bind(d,s).run(),new Response(JSON.stringify({ok:!0,adult_flag:d}),{headers:e})}catch(s){return new Response(JSON.stringify({ok:!1,message:s.message}),{status:500,headers:e})}}if(r.match(/^\/admin\/works\/\d+$/)&&i.method==="DELETE"){if(!D(i,t))return new Response(JSON.stringify({ok:!1,message:"Unauthorized"}),{status:401,headers:e});try{let s=parseInt(r.split("/")[3]),a=await t.DB.prepare("SELECT * FROM works WHERE tmdb_id = ?").bind(s).first();return await t.DB.prepare("DELETE FROM works WHERE tmdb_id = ?").bind(s).run(),await t.DB.prepare("INSERT INTO admin_logs (action, target_id, before_value) VALUES ('works_delete', ?, ?)").bind(String(s),JSON.stringify(a)).run(),new Response(JSON.stringify({ok:!0}),{headers:e})}catch(s){return new Response(JSON.stringify({ok:!1,message:s.message}),{status:500,headers:e})}}if(r==="/admin/new-match-count"&&i.method==="GET"){if(!D(i,t))return new Response(JSON.stringify({ok:!1,message:"Unauthorized"}),{status:401,headers:e});try{let s=f.searchParams.get("date")||new Date().toISOString().slice(0,10),a=await t.DB.prepare("SELECT COUNT(*) as count FROM works WHERE first_matched_date = ? AND match_source IN ('auto_claude','auto_tmdb')").bind(s).first();return new Response(JSON.stringify({ok:!0,count:a?.count||0,date:s}),{headers:e})}catch(s){return new Response(JSON.stringify({ok:!1,message:s.message}),{status:500,headers:e})}}if(r==="/admin/manual-rankings"&&i.method==="GET"){if(!D(i,t))return new Response(JSON.stringify({ok:!1,message:"Unauthorized"}),{status:401,headers:e});try{let s=f.searchParams.get("platform"),a=f.searchParams.get("category_slot");if(!s||!a)return new Response(JSON.stringify({ok:!1,message:"platform, category_slot required"}),{status:400,headers:e});let{results:d}=await t.DB.prepare(`
        SELECT id, rank, title_ko, title_en, tmdb_id, poster_path,
               genre, overview, release_year, tmdb_rating, source_name, memo, season
        FROM rankings
        WHERE date = 'manual' AND platform = ? AND category_slot = ?
        ORDER BY rank ASC
      `).bind(s,a).all();return new Response(JSON.stringify({ok:!0,data:d}),{headers:e})}catch(s){return new Response(JSON.stringify({ok:!1,message:s.message}),{status:500,headers:e})}}if(r==="/admin/manual-rankings"&&i.method==="POST"){if(!D(i,t))return new Response(JSON.stringify({ok:!1,message:"Unauthorized"}),{status:401,headers:e});try{let s=await i.json(),{platform:a,category_slot:d,source_name:l,tmdb_id:m,rank:u,memo:E}=s,w=s.season!==void 0?s.season:null;if(!a||!d||!m||!u)return new Response(JSON.stringify({ok:!1,message:"platform, category_slot, tmdb_id, rank required"}),{status:400,headers:e});let g=s.title_ko||"",y=s.title_en||"",k=s.poster_path||null,O=s.genre||null,R=s.overview||null,S=s.release_year||null,h=s.tmdb_rating??null,b=s.media_type==="tv"||s.media_type==="movie"?s.media_type:null;if(!g||!k||!y){let T=await t.DB.prepare("SELECT * FROM works WHERE tmdb_id = ?").bind(parseInt(m)).first();T&&(g=g||T.title_ko||"",y=y||T.title_en||"",k=k||T.poster_path||null,O=O||T.genre||null,R=R||T.overview||null,S=S||T.release_year||null,h=h??T.tmdb_rating??null)}if(!y)try{let T=b?[b]:["tv","movie"];for(let A of T){let L=await fetch(`https://api.themoviedb.org/3/${A}/${m}?language=en-US&api_key=${t.TMDB_API_KEY}`);if(!L.ok)continue;let C=await L.json();if(!C.name&&!C.title)continue;let I=C.original_title||C.original_name||"",F=C.title||C.name||"";y=/[\uAC00-\uD7A3]/.test(I)?F:I||F;break}}catch{}await t.DB.prepare(`
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
      `).bind(a,d,d,l||"",parseInt(u),g,y,parseInt(m),k,O,R,S,h,E||null,w!==null?parseInt(w):null).run();let N=new Date().toISOString();return await t.DB.prepare(`
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
      `).bind(parseInt(m),g||"",y||"",k,h,N).run(),await t.DB.prepare("INSERT INTO admin_logs (action, platform, category_slot, target_id, after_value) VALUES ('manual_ranking_add', ?, ?, ?, ?)").bind(a,d,String(m),JSON.stringify({rank:u,title_ko:g,title_en:y,memo:E})).run(),new Response(JSON.stringify({ok:!0,data:{title_ko:g,title_en:y,poster_path:k,genre:O,release_year:S,tmdb_rating:h}}),{headers:e})}catch(s){return new Response(JSON.stringify({ok:!1,message:s.message}),{status:500,headers:e})}}if(r==="/admin/manual-rankings/reorder"&&i.method==="PATCH"){if(!D(i,t))return new Response(JSON.stringify({ok:!1,message:"Unauthorized"}),{status:401,headers:e});try{let s=await i.json(),{platform:a,category_slot:d,items:l}=s;if(!a||!d||!Array.isArray(l))return new Response(JSON.stringify({ok:!1,message:"platform, category_slot, items required"}),{status:400,headers:e});let m=l.map(E=>t.DB.prepare("UPDATE rankings SET rank = ? WHERE id = ? AND date = 'manual'").bind(-parseInt(E.rank),parseInt(E.id)));await t.DB.batch(m);let u=l.map(E=>t.DB.prepare("UPDATE rankings SET rank = ?, memo = ?, season = ? WHERE id = ? AND date = 'manual'").bind(parseInt(E.rank),E.memo??null,E.season!==void 0&&E.season!==null?parseInt(E.season):null,parseInt(E.id)));return await t.DB.batch(u),await t.DB.prepare("INSERT INTO admin_logs (action, platform, category_slot, after_value) VALUES ('manual_ranking_reorder', ?, ?, ?)").bind(a,d,JSON.stringify(l)).run(),new Response(JSON.stringify({ok:!0}),{headers:e})}catch(s){return new Response(JSON.stringify({ok:!1,message:s.message}),{status:500,headers:e})}}if(r.match(/^\/admin\/manual-rankings\/\d+$/)&&i.method==="DELETE"){if(!D(i,t))return new Response(JSON.stringify({ok:!1,message:"Unauthorized"}),{status:401,headers:e});try{let s=parseInt(r.split("/")[3]),a=await t.DB.prepare("SELECT * FROM rankings WHERE id = ? AND date = 'manual'").bind(s).first();return a?(await t.DB.prepare("DELETE FROM rankings WHERE id = ? AND date = 'manual'").bind(s).run(),await t.DB.prepare("INSERT INTO admin_logs (action, platform, category_slot, target_id, before_value) VALUES ('manual_ranking_delete', ?, ?, ?, ?)").bind(a.platform,a.category_slot,String(a.tmdb_id),JSON.stringify({rank:a.rank,title_ko:a.title_ko,memo:a.memo})).run(),new Response(JSON.stringify({ok:!0}),{headers:e})):new Response(JSON.stringify({ok:!1,message:"Not found or not a manual ranking"}),{status:404,headers:e})}catch(s){return new Response(JSON.stringify({ok:!1,message:s.message}),{status:500,headers:e})}}if(r==="/admin/rankings/reorder"&&i.method==="PATCH"){if(!D(i,t))return new Response(JSON.stringify({ok:!1,message:"Unauthorized"}),{status:401,headers:e});try{let s=await i.json(),{date:a,platform:d,category_slot:l,items:m}=s;if(!a||!d||!l||!Array.isArray(m))return new Response(JSON.stringify({ok:!1,message:"date, platform, category_slot, items required"}),{status:400,headers:e});let u=[...m.map(E=>t.DB.prepare("UPDATE rankings SET rank = ? WHERE id = ? AND date = ? AND platform = ? AND category_slot = ?").bind(-parseInt(E.rank),parseInt(E.id),a,d,l)),...m.map(E=>t.DB.prepare("UPDATE rankings SET rank = ? WHERE id = ? AND date = ? AND platform = ? AND category_slot = ?").bind(parseInt(E.rank),parseInt(E.id),a,d,l))];return await t.DB.batch(u),await t.DB.prepare("INSERT INTO admin_logs (action, platform, category_slot, after_value) VALUES ('ranking_reorder', ?, ?, ?)").bind(d,l,JSON.stringify(m)).run(),new Response(JSON.stringify({ok:!0}),{headers:e})}catch(s){return new Response(JSON.stringify({ok:!1,message:s.message}),{status:500,headers:e})}}if(r==="/admin/sync-ratings"&&i.method==="PATCH"){if(!D(i,t))return new Response(JSON.stringify({ok:!1,message:"Unauthorized"}),{status:401,headers:e});try{let{results:s}=await t.DB.prepare(`
        SELECT r.id, r.tmdb_id
        FROM rankings r
        JOIN works w ON r.tmdb_id = w.tmdb_id
        WHERE r.tmdb_rating IS NULL AND r.tmdb_id IS NOT NULL AND w.tmdb_rating IS NOT NULL
        LIMIT 500
      `).all();if(!s.length)return new Response(JSON.stringify({ok:!0,updated:0,message:"\uB3D9\uAE30\uD654\uD560 \uB370\uC774\uD130 \uC5C6\uC74C"}),{headers:e});let a=s.map(d=>t.DB.prepare("UPDATE rankings SET tmdb_rating = (SELECT tmdb_rating FROM works WHERE tmdb_id = ?) WHERE id = ?").bind(d.tmdb_id,d.id));return await t.DB.batch(a),new Response(JSON.stringify({ok:!0,updated:s.length}),{headers:e})}catch(s){return new Response(JSON.stringify({ok:!1,message:s.message}),{status:500,headers:e})}}if(r.startsWith("/admin/works/")&&r.endsWith("/rating-status")&&i.method==="GET"){if(!D(i,t))return new Response(JSON.stringify({ok:!1,message:"Unauthorized"}),{status:401,headers:e});try{let s=parseInt(r.split("/admin/works/")[1].split("/rating-status")[0]);if(!s)return new Response(JSON.stringify({ok:!1,message:"tmdb_id required"}),{status:400,headers:e});let a=await t.DB.prepare("SELECT tmdb_id, title_ko, title_en, tmdb_rating, rating_updated_at FROM works WHERE tmdb_id = ?").bind(s).first();if(!a)return new Response(JSON.stringify({ok:!1,message:"works\uC5D0 \uC5C6\uB294 \uC791\uD488\uC785\uB2C8\uB2E4"}),{status:404,headers:e});let{results:d}=await t.DB.prepare(`
        SELECT id, platform, category_slot, date, tmdb_rating
        FROM rankings
        WHERE tmdb_id = ?
        ORDER BY date DESC, platform ASC
        LIMIT 50
      `).bind(s).all();return new Response(JSON.stringify({ok:!0,works:{tmdb_id:a.tmdb_id,title_ko:a.title_ko,title_en:a.title_en,tmdb_rating:a.tmdb_rating,rating_updated_at:a.rating_updated_at},rankings:d}),{headers:e})}catch(s){return new Response(JSON.stringify({ok:!1,message:s.message}),{status:500,headers:e})}}if(r==="/admin/works/sync-rating-single"&&i.method==="POST"){if(!D(i,t))return new Response(JSON.stringify({ok:!1,message:"Unauthorized"}),{status:401,headers:e});try{let s=await i.json().catch(()=>({})),a=parseInt(s.tmdb_id),d=!!s.refresh;if(!a)return new Response(JSON.stringify({ok:!1,message:"tmdb_id required"}),{status:400,headers:e});let l=await t.DB.prepare("SELECT tmdb_id, media_type, tmdb_rating FROM works WHERE tmdb_id = ?").bind(a).first();if(!l)return new Response(JSON.stringify({ok:!1,message:"works\uC5D0 \uC5C6\uB294 \uC791\uD488\uC785\uB2C8\uB2E4"}),{status:404,headers:e});let m=l.tmdb_rating??null;if(d){let E=l.media_type?[l.media_type]:["tv","movie"],w=!1,g=null,y=null;for(let O of E)try{let R=await fetch(`https://api.themoviedb.org/3/${O}/${a}?api_key=${t.TMDB_API_KEY}`);if(!R.ok)continue;let S=await R.json();w=!0,g=S.vote_average??null,y=S.release_date||S.first_air_date||null;break}catch{}if(!w)return new Response(JSON.stringify({ok:!1,message:"TMDB \uC870\uD68C \uC2E4\uD328 \u2014 \uC7A0\uC2DC \uD6C4 \uB2E4\uC2DC \uC2DC\uB3C4\uD574\uC8FC\uC138\uC694"}),{status:502,headers:e});let k=new Date().toISOString();await t.DB.prepare("UPDATE works SET tmdb_rating = ?, release_date = ?, rating_updated_at = ? WHERE tmdb_id = ?").bind(g,y,k,a).run(),m=g}let u=await t.DB.prepare("UPDATE rankings SET tmdb_rating = ? WHERE tmdb_id = ?").bind(m,a).run();return new Response(JSON.stringify({ok:!0,tmdb_rating:m,rankings_updated:u.meta?.changes??0}),{headers:e})}catch(s){return new Response(JSON.stringify({ok:!1,message:s.message}),{status:500,headers:e})}}if(r==="/admin/rankings/rating-check"&&i.method==="GET"){if(!D(i,t))return new Response(JSON.stringify({ok:!1,message:"Unauthorized"}),{status:401,headers:e});try{let s=f.searchParams.get("platform"),a=f.searchParams.get("category_slot");if(!s||!a)return new Response(JSON.stringify({ok:!1,message:"platform, category_slot required"}),{status:400,headers:e});let{results:d}=await t.DB.prepare(`
        SELECT r.tmdb_id, r.rank, r.title_ko,
               r.tmdb_rating   AS rankings_rating,
               w.tmdb_rating   AS works_rating,
               w.rating_updated_at
        FROM rankings r
        LEFT JOIN works w ON r.tmdb_id = w.tmdb_id
        WHERE r.platform = ? AND r.category_slot = ?
          AND r.date = (SELECT value FROM app_settings WHERE key = 'latest_ranking_date')
        ORDER BY r.rank ASC
      `).bind(s,a).all();return new Response(JSON.stringify({ok:!0,data:d}),{headers:e})}catch(s){return new Response(JSON.stringify({ok:!1,message:s.message}),{status:500,headers:e})}}if(r==="/admin/works/collect-keywords"&&i.method==="POST"){if(!D(i,t))return new Response(JSON.stringify({ok:!1,message:"Unauthorized"}),{status:401,headers:e});try{let s=await i.json().catch(()=>({})),a=Math.min(parseInt(s.limit)||20,50),{results:d}=await t.DB.prepare(`
        SELECT tmdb_id, media_type FROM works
        WHERE (keywords IS NULL OR keywords = '')
        AND (adult_flag IS NULL OR adult_flag NOT IN (1, 2))
        LIMIT ?
      `).bind(a).all();if(!d.length)return new Response(JSON.stringify({ok:!0,processed:0,attempted:0,remaining:0,message:"\uC218\uC9D1\uD560 \uC791\uD488 \uC5C6\uC74C"}),{headers:e});let l=0,m=0,u=[];for(let w of d){let g=w.media_type?[w.media_type]:["tv","movie"],y="",k=!1;for(let O of g)try{let R=await fetch(`https://api.themoviedb.org/3/${O}/${w.tmdb_id}/keywords?api_key=${t.TMDB_API_KEY}`);if(!R.ok)continue;k=!0;let S=await R.json(),h=S.keywords||S.results||[];if(h.length){y=h.map(b=>b.name).filter(Boolean).join(",");break}}catch{}y?(u.push(t.DB.prepare("UPDATE works SET keywords = ? WHERE tmdb_id = ?").bind(y,w.tmdb_id)),l++):k?u.push(t.DB.prepare("UPDATE works SET keywords = ? WHERE tmdb_id = ?").bind("__NONE__",w.tmdb_id)):m++}u.length&&await t.DB.batch(u);let E=await t.DB.prepare("SELECT COUNT(*) as cnt FROM works WHERE (keywords IS NULL OR keywords = '') AND (adult_flag IS NULL OR adult_flag NOT IN (1, 2))").first();return new Response(JSON.stringify({ok:!0,processed:l,attempted:d.length,skippedRetry:m,remaining:E?.cnt||0}),{headers:e})}catch(s){return new Response(JSON.stringify({ok:!1,message:s.message}),{status:500,headers:e})}}if(r==="/admin/works/collect-ott"&&i.method==="POST"){if(!D(i,t))return new Response(JSON.stringify({ok:!1,message:"Unauthorized"}),{status:401,headers:e});try{let s=await i.json().catch(()=>({})),a=Math.min(parseInt(s.limit)||30,30),d=15,{results:l}=await t.DB.prepare(`
        SELECT tmdb_id, media_type FROM works
        WHERE (ott_updated_at IS NULL OR ott_updated_at < datetime('now', '-${d} days'))
        LIMIT ?
      `).bind(a).all();if(!l.length)return new Response(JSON.stringify({ok:!0,processed:0,attempted:0,remaining:0,message:"\uC218\uC9D1\uD560 \uC791\uD488 \uC5C6\uC74C"}),{headers:e});let m=l.map(N=>N.tmdb_id),u=m.map(()=>"?").join(","),{results:E}=await t.DB.prepare(`
        SELECT tmdb_id, platform FROM rankings
        WHERE tmdb_id IN (${u})
          AND date = (SELECT value FROM app_settings WHERE key = 'latest_ranking_date')
      `).bind(...m).all(),w={};E.forEach(N=>{(w[N.tmdb_id]||=new Set).add(N.platform)});let{results:g}=await t.DB.prepare(`
        SELECT tmdb_id, ott_key, action FROM work_ott_overrides
        WHERE tmdb_id IN (${u})
      `).bind(...m).all(),y={};g.forEach(N=>{(y[N.tmdb_id]||=[]).push(N)});let k=[[/netflix/i,"netflix"],[/tving/i,"tving"],[/disney/i,"disney"],[/coupang/i,"coupang"],[/wavve/i,"wavve"],[/watcha/i,"watcha"]],O=0,R=0,S=[],h=[];for(let N of l){let T=N.tmdb_id,A=N.media_type==="movie"?"movie":"tv",L=new Set(w[T]||[]),C=!1;try{if(A==="tv"&&!L.has("coupang")){let F=await fetch(`https://api.themoviedb.org/3/tv/${T}?api_key=${t.TMDB_API_KEY}`);F.ok&&(C=!0,((await F.json()).networks||[]).some(M=>M.id===5169)&&L.add("coupang"))}let I=await fetch(`https://api.themoviedb.org/3/${A}/${T}/watch/providers?api_key=${t.TMDB_API_KEY}`);if(I.ok){C=!0;let F=await I.json(),H=F.results&&F.results.KR||{};[...H.flatrate||[],...H.rent||[],...H.buy||[]].forEach(W=>{let U=k.find(([j])=>j.test(W.provider_name||""));U&&L.add(U[1])})}}catch{}if(!C&&L.size===0){R++;continue}(y[T]||[]).forEach(I=>{I.action==="add"?L.add(I.ott_key):I.action==="remove"&&L.delete(I.ott_key)}),S.push(t.DB.prepare("DELETE FROM work_ott WHERE tmdb_id = ?").bind(T)),[...L].forEach(I=>{S.push(t.DB.prepare("INSERT INTO work_ott (tmdb_id, ott_key) VALUES (?, ?)").bind(T,I))}),h.push(T),O++}if(h.length){let N=h.map(()=>"?").join(",");S.push(t.DB.prepare(`UPDATE works SET ott_updated_at = datetime('now') WHERE tmdb_id IN (${N})`).bind(...h))}S.length&&await t.DB.batch(S);let b=await t.DB.prepare(`
        SELECT COUNT(*) as cnt FROM works
        WHERE (ott_updated_at IS NULL OR ott_updated_at < datetime('now', '-${d} days'))
      `).first();return new Response(JSON.stringify({ok:!0,processed:O,attempted:l.length,skippedRetry:R,remaining:b?.cnt||0}),{headers:e})}catch(s){return new Response(JSON.stringify({ok:!1,message:s.message}),{status:500,headers:e})}}if(r==="/admin/works/ott-stuck"&&i.method==="GET"){if(!D(i,t))return new Response(JSON.stringify({ok:!1,message:"Unauthorized"}),{status:401,headers:e});try{let s=Math.min(parseInt(new URL(i.url).searchParams.get("limit"))||30,50),{results:a}=await t.DB.prepare(`
        SELECT tmdb_id, title_ko, title_en, media_type FROM works
        WHERE ott_updated_at IS NULL
        ORDER BY tmdb_id DESC
        LIMIT ?
      `).bind(s).all();return new Response(JSON.stringify({ok:!0,items:a}),{headers:e})}catch(s){return new Response(JSON.stringify({ok:!1,message:s.message}),{status:500,headers:e})}}if(r==="/admin/works/verify-type"&&i.method==="POST"){if(!D(i,t))return new Response(JSON.stringify({ok:!1,message:"Unauthorized"}),{status:401,headers:e});try{let a=((await i.json().catch(()=>({}))).tmdb_ids||[]).slice(0,50);if(!a.length)return new Response(JSON.stringify({ok:!1,message:"tmdb_ids \uD544\uC694\uD574\uC694"}),{status:400,headers:e});let d=await Promise.all(a.map(async l=>{let[m,u]=await Promise.all([fetch(`https://api.themoviedb.org/3/movie/${l}?api_key=${t.TMDB_API_KEY}`),fetch(`https://api.themoviedb.org/3/tv/${l}?api_key=${t.TMDB_API_KEY}`)]),E=m.ok,w=u.ok,g=null;return E&&w?g="both":E?g="movie":w?g="tv":g="none",{tmdb_id:l,movie_ok:E,tv_ok:w,suggested:g}}));return new Response(JSON.stringify({ok:!0,results:d}),{headers:e})}catch(s){return new Response(JSON.stringify({ok:!1,message:s.message}),{status:500,headers:e})}}if(r==="/admin/works/apply-type-fix"&&i.method==="POST"){if(!D(i,t))return new Response(JSON.stringify({ok:!1,message:"Unauthorized"}),{status:401,headers:e});try{let a=((await i.json().catch(()=>({}))).fixes||[]).filter(l=>l.tmdb_id&&["movie","tv"].includes(l.media_type));if(!a.length)return new Response(JSON.stringify({ok:!1,message:"fixes \uD544\uC694\uD574\uC694 (tmdb_id, media_type)"}),{status:400,headers:e});let d=a.map(l=>t.DB.prepare("UPDATE works SET media_type = ? WHERE tmdb_id = ?").bind(l.media_type,l.tmdb_id));return await t.DB.batch(d),new Response(JSON.stringify({ok:!0,updated:a.length}),{headers:e})}catch(s){return new Response(JSON.stringify({ok:!1,message:s.message}),{status:500,headers:e})}}if(r==="/admin/works/adult-search"&&i.method==="GET"){if(!D(i,t))return new Response(JSON.stringify({ok:!1,message:"Unauthorized"}),{status:401,headers:e});try{let s=Math.min(parseInt(f.searchParams.get("limit"))||50,100),a=(f.searchParams.get("word")||"").trim(),d,l;if(a)d="adult_flag IS NULL AND (title_ko LIKE ? OR title_en LIKE ? OR overview LIKE ? OR keywords LIKE ?)",l=[`%${a}%`,`%${a}%`,`%${a}%`,`%${a}%`];else{let E=["\uC815\uC0AC","\uC57C\uD55C","\uACC4\uBAA8","\uC0C8\uC5C4\uB9C8","\uCC98\uC81C","\uD615\uC218","\uB3D9\uC11C","\uC720\uD639","\uBD88\uB95C","\uC678\uB3C4","\uBAB8\uB9E4","\uD558\uB8FB\uBC24"],w=E.map(()=>"(title_ko LIKE ? OR overview LIKE ?)").join(" OR "),g=E.flatMap(R=>[`%${R}%`,`%${R}%`]),y=["softcore","erotica","pinku eiga","sexploitation"],k=y.map(()=>"keywords LIKE ?").join(" OR "),O=y.map(R=>`%${R}%`);d=`adult_flag IS NULL AND (${w} OR ${k})`,l=[...g,...O]}let{results:m}=await t.DB.prepare(`
        SELECT tmdb_id, title_ko, title_en, poster_path, media_type
        FROM works
        WHERE ${d}
        LIMIT ?
      `).bind(...l,s).all(),u=await t.DB.prepare(`
        SELECT COUNT(*) as cnt FROM works WHERE ${d}
      `).bind(...l).first();return new Response(JSON.stringify({ok:!0,items:m,remaining:u?.cnt||0}),{headers:e})}catch(s){return new Response(JSON.stringify({ok:!1,message:s.message}),{status:500,headers:e})}}if(r==="/admin/works/adult-review"&&i.method==="POST"){if(!D(i,t))return new Response(JSON.stringify({ok:!1,message:"Unauthorized"}),{status:401,headers:e});try{let s=await i.json().catch(()=>({})),a=Array.isArray(s.delete_ids)?s.delete_ids.map(Number).filter(Boolean):[],d=Array.isArray(s.clear_ids)?s.clear_ids.map(Number).filter(Boolean):[],l=0,m=0;if(a.length){let u=a.map(E=>t.DB.prepare("DELETE FROM works WHERE tmdb_id = ?").bind(E));await t.DB.batch(u),l=a.length}if(d.length){let u=d.map(E=>t.DB.prepare("UPDATE works SET adult_flag = 0 WHERE tmdb_id = ?").bind(E));await t.DB.batch(u),m=d.length}return new Response(JSON.stringify({ok:!0,deleted:l,cleared:m}),{headers:e})}catch(s){return new Response(JSON.stringify({ok:!1,message:s.message}),{status:500,headers:e})}}if(r==="/admin/works/backfill-normalize-keywords"&&i.method==="POST"){if(!D(i,t))return new Response(JSON.stringify({ok:!1,message:"Unauthorized"}),{status:401,headers:e});try{let s=await i.json().catch(()=>({})),a=Math.min(parseInt(s.limit)||200,300),{results:d}=await t.DB.prepare(`
        SELECT tmdb_id, keywords FROM works
        WHERE keywords_normalized_at IS NULL
          AND keywords IS NOT NULL AND keywords != ''
        LIMIT ?
      `).bind(a).all();if(!d.length)return new Response(JSON.stringify({ok:!0,processed:0,attempted:0,remaining:0,message:"\uC815\uADDC\uD654\uD560 \uC791\uD488 \uC5C6\uC74C"}),{headers:e});let l=[],m=0,u=new Date().toISOString();for(let w of d){if(w.keywords&&w.keywords!=="__NONE__"){let g=new Set(w.keywords.split(",").map(y=>y.trim().toLowerCase()).filter(Boolean));if(g.size){for(let y of g)l.push(t.DB.prepare("INSERT OR IGNORE INTO work_keywords (tmdb_id, keyword) VALUES (?, ?)").bind(w.tmdb_id,y)),l.push(t.DB.prepare("INSERT OR IGNORE INTO keyword_translation (keyword_en) VALUES (?)").bind(y));m++}}l.push(t.DB.prepare("UPDATE works SET keywords_normalized_at = ? WHERE tmdb_id = ?").bind(u,w.tmdb_id))}l.length&&await t.DB.batch(l);let E=await t.DB.prepare(`
        SELECT COUNT(*) as cnt FROM works
        WHERE keywords_normalized_at IS NULL
          AND keywords IS NOT NULL AND keywords != ''
      `).first();return new Response(JSON.stringify({ok:!0,processed:m,attempted:d.length,remaining:E?.cnt||0}),{headers:e})}catch(s){return new Response(JSON.stringify({ok:!1,message:s.message}),{status:500,headers:e})}}if(r==="/admin/keywords/translate"&&i.method==="POST"){if(!D(i,t))return new Response(JSON.stringify({ok:!1,message:"Unauthorized"}),{status:401,headers:e});if(!t.ANTHROPIC_API_KEY)return new Response(JSON.stringify({ok:!1,message:"ANTHROPIC_API_KEY\uAC00 Workers Secrets\uC5D0 \uC124\uC815\uB418\uC5B4 \uC788\uC9C0 \uC54A\uC2B5\uB2C8\uB2E4"}),{status:500,headers:e});try{let s=await i.json().catch(()=>({})),a=Math.min(parseInt(s.limit)||40,60),{results:d}=await t.DB.prepare(`
        SELECT keyword_en FROM keyword_translation
        WHERE source IS NULL
          AND (translate_attempts IS NULL OR translate_attempts < 3)
        LIMIT ?
      `).bind(a).all();if(!d.length)return new Response(JSON.stringify({ok:!0,attempted:0,translated:0,remaining:0,message:"\uBC88\uC5ED\uD560 \uD0A4\uC6CC\uB4DC \uC5C6\uC74C"}),{headers:e});let l=d.map(b=>`- ${b.keyword_en}`).join(`
`),m='\uB108\uB294 TMDB \uC601\uBB38 \uC791\uD488 \uD0A4\uC6CC\uB4DC(\uD14C\uB9C8/\uBD84\uC704\uAE30 \uD0DC\uADF8)\uB97C \uD55C\uAD6D OTT \uC11C\uBE44\uC2A4 \uC0AC\uC6A9\uC790\uC6A9\uC73C\uB85C \uBC88\uC5ED\uD558\uB294 \uB3C4\uC6B0\uBBF8\uB2E4. \uAC01 \uC601\uBB38 \uD0A4\uC6CC\uB4DC\uB97C \uC790\uC5F0\uC2A4\uB7FD\uACE0 \uAC04\uACB0\uD55C \uD55C\uAD6D\uC5B4 \uBA85\uC0AC\uAD6C(\uB300\uB7B5 2~8\uC790)\uB85C \uBC88\uC5ED\uD574\uB77C. \uC9C1\uC5ED\uBCF4\uB2E4 \uD55C\uAD6D \uC2DC\uCCAD\uC790\uC5D0\uAC8C \uC775\uC219\uD55C \uD45C\uD604\uC744 \uC6B0\uC120\uD574\uB77C(\uC608: revenge\u2192\uBCF5\uC218, chaebol\u2192\uC7AC\uBC8C, coming of age\u2192\uC131\uC7A5). \uC124\uBA85\uC774\uB098 \uBD80\uC5F0 \uC5C6\uC774, \uC694\uCCAD\uBC1B\uC740 \uD0A4\uC6CC\uB4DC \uC804\uBD80\uC5D0 \uB300\uD574 1:1\uB85C \uBC88\uC5ED\uD574\uB77C. \uBC18\uB4DC\uC2DC JSON \uBC30\uC5F4\uB9CC \uCD9C\uB825\uD558\uACE0, \uB2E4\uB978 \uC124\uBA85\uC774\uB098 \uCF54\uB4DC\uBE14\uB85D(```)\uC740 \uC808\uB300 \uD3EC\uD568\uD558\uC9C0 \uB9C8\uB77C. \uCD9C\uB825 \uD615\uC2DD: [{"keyword_en":"revenge","keyword_ko":"\uBCF5\uC218"}, ...]',u=`\uBC88\uC5ED\uD560 \uD0A4\uC6CC\uB4DC \uBAA9\uB85D:
${l}`,E=await fetch("https://api.anthropic.com/v1/messages",{method:"POST",headers:{"Content-Type":"application/json","x-api-key":t.ANTHROPIC_API_KEY,"anthropic-version":"2023-06-01"},body:JSON.stringify({model:"claude-haiku-4-5-20251001",max_tokens:3e3,system:m,messages:[{role:"user",content:u}]})});if(!E.ok){let b=await E.text().catch(()=>"");return new Response(JSON.stringify({ok:!1,message:`Claude API \uC624\uB958 (status ${E.status})`,detail:b.slice(0,300)}),{status:502,headers:e})}let g=((await E.json()).content||[]).filter(b=>b.type==="text").map(b=>b.text).join(""),y;try{let b=g.replace(/```json|```/g,"").trim();y=JSON.parse(b)}catch{return new Response(JSON.stringify({ok:!1,message:"Claude \uC751\uB2F5 \uD30C\uC2F1 \uC2E4\uD328 \u2014 \uB2E4\uC2DC \uC2DC\uB3C4\uD574\uC8FC\uC138\uC694",raw:g.slice(0,300)}),{status:502,headers:e})}Array.isArray(y)||(y=[]);let k=new Set(d.map(b=>b.keyword_en)),O=new Map;for(let b of y){let N=(b.keyword_en||"").trim().toLowerCase(),T=(b.keyword_ko||"").trim();!N||!T||!k.has(N)||O.set(N,T)}let R=[],S=0;for(let b of d){if(!O.has(b.keyword_en)){R.push(t.DB.prepare("UPDATE keyword_translation SET translate_attempts = COALESCE(translate_attempts, 0) + 1 WHERE keyword_en = ? AND source IS NULL").bind(b.keyword_en));continue}R.push(t.DB.prepare("UPDATE keyword_translation SET keyword_ko = ?, source = 'auto' WHERE keyword_en = ? AND source IS NULL").bind(O.get(b.keyword_en),b.keyword_en)),S++}R.length&&await t.DB.batch(R);let h=await t.DB.prepare(`
        SELECT
          SUM(CASE WHEN source IS NULL AND (translate_attempts IS NULL OR translate_attempts < 3) THEN 1 ELSE 0 END) AS remaining,
          SUM(CASE WHEN source IS NULL AND translate_attempts >= 3 THEN 1 ELSE 0 END) AS stuck
        FROM keyword_translation
      `).first();return new Response(JSON.stringify({ok:!0,attempted:d.length,translated:S,remaining:h?.remaining||0,stuck:h?.stuck||0}),{headers:e})}catch(s){return new Response(JSON.stringify({ok:!1,message:s.message}),{status:500,headers:e})}}if(r==="/admin/keywords/review"&&i.method==="GET"){if(!D(i,t))return new Response(JSON.stringify({ok:!1,message:"Unauthorized"}),{status:401,headers:e});try{let s=Math.min(parseInt(f.searchParams.get("limit"))||30,60),{results:a}=await t.DB.prepare(`
        SELECT id, keyword_en, keyword_ko
        FROM keyword_translation
        WHERE source = 'auto'
        ORDER BY id ASC
        LIMIT ?
      `).bind(s).all(),d=await t.DB.prepare("SELECT COUNT(*) as cnt FROM keyword_translation WHERE source = 'auto'").first();return new Response(JSON.stringify({ok:!0,items:a,remaining:d?.cnt||0}),{headers:e})}catch(s){return new Response(JSON.stringify({ok:!1,message:s.message}),{status:500,headers:e})}}if(r==="/admin/keywords/review"&&i.method==="POST"){if(!D(i,t))return new Response(JSON.stringify({ok:!1,message:"Unauthorized"}),{status:401,headers:e});try{let s=await i.json().catch(()=>({})),d=(Array.isArray(s.items)?s.items:[]).filter(u=>u&&u.id&&typeof u.keyword_ko=="string"&&u.keyword_ko.trim());if(!d.length)return new Response(JSON.stringify({ok:!1,message:"\uC720\uD6A8\uD55C \uD56D\uBAA9\uC774 \uC5C6\uC5B4\uC694"}),{status:400,headers:e});let l=d.map(u=>t.DB.prepare("UPDATE keyword_translation SET keyword_ko = ?, source = 'admin' WHERE id = ?").bind(u.keyword_ko.trim(),parseInt(u.id)));await t.DB.batch(l);let m=await t.DB.prepare("SELECT COUNT(*) as cnt FROM keyword_translation WHERE source = 'auto'").first();return new Response(JSON.stringify({ok:!0,updated:d.length,remaining:m?.cnt||0}),{headers:e})}catch(s){return new Response(JSON.stringify({ok:!1,message:s.message}),{status:500,headers:e})}}if(r==="/admin/keywords/search"&&i.method==="GET"){if(!D(i,t))return new Response(JSON.stringify({ok:!1,message:"Unauthorized"}),{status:401,headers:e});try{let s=(f.searchParams.get("q")||"").trim();if(!s)return new Response(JSON.stringify({ok:!1,message:"\uAC80\uC0C9\uC5B4(q)\uAC00 \uD544\uC694\uD574\uC694"}),{status:400,headers:e});let a=`%${s}%`,{results:d}=await t.DB.prepare(`
        SELECT id, keyword_en, keyword_ko, keyword_ko_2, keyword_ko_3, source
        FROM keyword_translation
        WHERE keyword_en LIKE ? OR keyword_ko LIKE ? OR keyword_ko_2 LIKE ? OR keyword_ko_3 LIKE ?
        ORDER BY keyword_en ASC
        LIMIT 50
      `).bind(a,a,a,a).all();return new Response(JSON.stringify({ok:!0,items:d}),{headers:e})}catch(s){return new Response(JSON.stringify({ok:!1,message:s.message}),{status:500,headers:e})}}if(r==="/admin/keywords/update"&&i.method==="POST"){if(!D(i,t))return new Response(JSON.stringify({ok:!1,message:"Unauthorized"}),{status:401,headers:e});try{let s=await i.json().catch(()=>({})),a=(s.keyword_en||"").trim(),d=(s.keyword_ko||"").trim(),l=(s.keyword_ko_2||"").trim()||null,m=(s.keyword_ko_3||"").trim()||null;if(!a||!d)return new Response(JSON.stringify({ok:!1,message:"keyword_en, keyword_ko \uBAA8\uB450 \uD544\uC694\uD574\uC694"}),{status:400,headers:e});let u=await t.DB.prepare("UPDATE keyword_translation SET keyword_ko = ?, keyword_ko_2 = ?, keyword_ko_3 = ?, source = 'admin' WHERE keyword_en = ?").bind(d,l,m,a).run();return!u.meta||u.meta.changes===0?new Response(JSON.stringify({ok:!1,message:"\uD574\uB2F9 keyword_en\uC744 \uCC3E\uC9C0 \uBABB\uD588\uC5B4\uC694"}),{status:404,headers:e}):new Response(JSON.stringify({ok:!0}),{headers:e})}catch(s){return new Response(JSON.stringify({ok:!1,message:s.message}),{status:500,headers:e})}}if(r==="/admin/works/keywords"&&i.method==="GET"){if(!D(i,t))return new Response(JSON.stringify({ok:!1,message:"Unauthorized"}),{status:401,headers:e});try{let s=(f.searchParams.get("q")||"").trim();if(!s)return new Response(JSON.stringify({ok:!1,message:"\uAC80\uC0C9\uC5B4(q)\uAC00 \uD544\uC694\uD574\uC694"}),{status:400,headers:e});let a;if(/^\d+$/.test(s)){let u=await t.DB.prepare("SELECT tmdb_id, title_ko, title_en FROM works WHERE tmdb_id = ?").bind(parseInt(s)).first();a=u?[u]:[]}else{let{results:u}=await t.DB.prepare(`
          SELECT tmdb_id, title_ko, title_en FROM works
          WHERE title_ko LIKE ? OR title_en LIKE ?
          ORDER BY tmdb_rating DESC
          LIMIT 5
        `).bind(`%${s}%`,`%${s}%`).all();a=u}if(!a.length)return new Response(JSON.stringify({ok:!0,works:[],items:[]}),{headers:e});let d=a.map(u=>u.tmdb_id),l=d.map(()=>"?").join(","),{results:m}=await t.DB.prepare(`
        SELECT DISTINCT kt.id, kt.keyword_en, kt.keyword_ko, kt.keyword_ko_2, kt.keyword_ko_3, kt.source
        FROM work_keywords wk
        JOIN keyword_translation kt ON kt.keyword_en = wk.keyword
        WHERE wk.tmdb_id IN (${l})
        ORDER BY kt.keyword_en ASC
      `).bind(...d).all();return new Response(JSON.stringify({ok:!0,works:a,items:m}),{headers:e})}catch(s){return new Response(JSON.stringify({ok:!1,message:s.message}),{status:500,headers:e})}}let c=r.match(/^\/admin\/works\/(\d+)\/reset-keyword-cache$/);if(c&&i.method==="POST"){if(!D(i,t))return new Response(JSON.stringify({ok:!1,message:"Unauthorized"}),{status:401,headers:e});try{let s=parseInt(c[1]),a=await t.DB.prepare("UPDATE works SET keyword_ko_map_updated_at = NULL WHERE tmdb_id = ?").bind(s).run();return!a.meta||a.meta.changes===0?new Response(JSON.stringify({ok:!1,message:"\uD574\uB2F9 tmdb_id\uB97C \uCC3E\uC9C0 \uBABB\uD588\uC5B4\uC694"}),{status:404,headers:e}):new Response(JSON.stringify({ok:!0}),{headers:e})}catch(s){return new Response(JSON.stringify({ok:!1,message:s.message}),{status:500,headers:e})}}if(r==="/admin/works/discover-collect"&&i.method==="POST"){if(!D(i,t))return new Response(JSON.stringify({ok:!1,message:"Unauthorized"}),{status:401,headers:e});try{let s=await i.json().catch(()=>({})),a=s.media_type,d=Math.max(parseInt(s.page)||1,1);if(!["movie","tv"].includes(a))return new Response(JSON.stringify({ok:!1,message:"media_type\uC740 'movie' \uB610\uB294 'tv'\uB9CC \uD5C8\uC6A9"}),{status:400,headers:e});let l=a==="movie"?`https://api.themoviedb.org/3/discover/movie?api_key=${t.TMDB_API_KEY}&language=ko-KR&region=KR&with_original_language=ko&sort_by=popularity.desc&page=${d}`:`https://api.themoviedb.org/3/discover/tv?api_key=${t.TMDB_API_KEY}&language=ko-KR&with_origin_country=KR&sort_by=popularity.desc&page=${d}`,m=await fetch(l);if(!m.ok)return new Response(JSON.stringify({ok:!1,message:`TMDB discover \uC870\uD68C \uC2E4\uD328 (status ${m.status})`}),{status:502,headers:e});let u=await m.json(),E=u.results||[],w=u.total_pages||1;if(!E.length)return new Response(JSON.stringify({ok:!0,attempted:0,inserted:0,skipped:0,hasNextPage:!1,nextPage:d+1,totalPages:w}),{headers:e});let g=E.map(b=>b.id),y=g.map(()=>"?").join(","),{results:k}=await t.DB.prepare(`SELECT tmdb_id FROM works WHERE tmdb_id IN (${y})`).bind(...g).all(),O=new Set((k||[]).map(b=>b.tmdb_id)),R=E.filter(b=>!O.has(b.id)),S=[],h=0;for(let b of R){let N=null,T=null,A=null,L=null,C=null,I=null,F="";try{let H=await fetch(`https://api.themoviedb.org/3/${a}/${b.id}?language=ko-KR&api_key=${t.TMDB_API_KEY}`);if(H.ok){let M=await H.json();N=M.name||M.title||b.name||b.title||null,A=M.poster_path||b.poster_path||null,L=(M.genres||[]).map(W=>W.name).join(", ")||null,C=M.vote_average?parseFloat(M.vote_average.toFixed(1)):null,I=parseInt((M.first_air_date||M.release_date||"").slice(0,4))||null,F=M.overview||b.overview||""}}catch{}if(N){try{let H=await fetch(`https://api.themoviedb.org/3/${a}/${b.id}?language=en-US&api_key=${t.TMDB_API_KEY}`);if(H.ok){let M=await H.json(),W=M.original_title||M.original_name||"",U=M.title||M.name||"";T=/[\uAC00-\uD7A3]/.test(W)?U:W||U}}catch{}S.push(t.DB.prepare(`
            INSERT INTO works
              (tmdb_id, title_ko, title_en, overview, genre, release_year,
               tmdb_rating, poster_path, media_type, match_source, confidence_score, first_matched_date)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'auto_discover', 90, date('now'))
            ON CONFLICT(tmdb_id) DO NOTHING
          `).bind(b.id,N,T||"",F||"",L||"",I,C,A,a)),h++}}return S.length&&await t.DB.batch(S),new Response(JSON.stringify({ok:!0,attempted:E.length,inserted:h,skipped:E.length-R.length,hasNextPage:d<w,nextPage:d+1,totalPages:w}),{headers:e})}catch(s){return new Response(JSON.stringify({ok:!1,message:s.message}),{status:500,headers:e})}}if(r==="/admin/works/classify-variety"&&i.method==="POST"){if(!D(i,t))return new Response(JSON.stringify({ok:!1,message:"Unauthorized"}),{status:401,headers:e});if(!t.ANTHROPIC_API_KEY)return new Response(JSON.stringify({ok:!1,message:"ANTHROPIC_API_KEY\uAC00 Workers Secrets\uC5D0 \uC124\uC815\uB418\uC5B4 \uC788\uC9C0 \uC54A\uC2B5\uB2C8\uB2E4"}),{status:500,headers:e});try{let s=await i.json().catch(()=>({})),a=Math.min(parseInt(s.limit)||10,15),{results:d}=await t.DB.prepare("SELECT label FROM variety_genre_options ORDER BY sort_order ASC").all();if(!d.length)return new Response(JSON.stringify({ok:!1,message:"variety_genre_options\uC5D0 \uD0DC\uADF8\uAC00 \uD558\uB098\uB3C4 \uC5C6\uC2B5\uB2C8\uB2E4. \uBA3C\uC800 \uD0DC\uADF8\uB97C \uB4F1\uB85D\uD574\uC8FC\uC138\uC694."}),{status:400,headers:e});let l=d.map(T=>T.label),{results:m}=await t.DB.prepare(`
        SELECT tmdb_id, title_ko, overview, genre
        FROM works
        WHERE original_language = 'ko'
          AND variety_genre_source IS NULL
          AND (
            genre LIKE '%Reality%' OR genre LIKE '%Talk%' OR
            genre LIKE '%\uB2E4\uD050\uBA58\uD130\uB9AC%' OR genre LIKE '%\uB9AC\uC5BC\uB9AC\uD2F0%' OR genre LIKE '%\uD1A0\uD06C%'
          )
        LIMIT ?
      `).bind(a).all();if(!m.length)return new Response(JSON.stringify({ok:!0,attempted:0,classified:0,remaining:0,message:"\uBD84\uB958\uD560 \uC791\uD488 \uC5C6\uC74C"}),{headers:e});let u=m.map(T=>`- tmdb_id:${T.tmdb_id} / \uC81C\uBAA9:"${T.title_ko||""}" / \uC904\uAC70\uB9AC:"${(T.overview||"").slice(0,200)}"`).join(`
`),E='\uB108\uB294 \uD55C\uAD6D \uC608\uB2A5 \uD504\uB85C\uADF8\uB7A8\uC744 \uBD84\uB958\uD558\uB294 \uB3C4\uC6B0\uBBF8\uB2E4. \uC544\uB798 \uD0DC\uADF8 \uBAA9\uB85D \uC911\uC5D0\uC11C\uB9CC \uACE8\uB77C\uC57C \uD558\uBA70, \uBAA9\uB85D\uC5D0 \uC5C6\uB294 \uD0DC\uADF8\uB294 \uC808\uB300 \uB9CC\uB4E4\uC5B4\uB0B4\uC9C0 \uB9C8\uB77C. \uAC01 \uC791\uD488\uB9C8\uB2E4 \uAC00\uC7A5 \uC5B4\uC6B8\uB9AC\uB294 \uD0DC\uADF8\uB97C \uCD5C\uB300 2\uAC1C\uAE4C\uC9C0 \uACE0\uB974\uACE0, \uC560\uB9E4\uD558\uBA74 1\uAC1C\uB9CC \uACE0\uB974\uAC70\uB098 "\uC77C\uBC18 \uC608\uB2A5"\uC744 \uC120\uD0DD\uD574\uB77C. \uC608\uB2A5\uC774 \uC544\uB2C8\uB77C\uACE0 \uD310\uB2E8\uB418\uBA74(\uB4DC\uB77C\uB9C8/\uC601\uD654/\uB2E4\uD050 \uB4F1) tags\uB97C \uBE48 \uBC30\uC5F4\uB85C \uB0A8\uACA8\uB77C. \uBC18\uB4DC\uC2DC JSON \uBC30\uC5F4\uB9CC \uCD9C\uB825\uD558\uACE0, \uB2E4\uB978 \uC124\uBA85\uC774\uB098 \uCF54\uB4DC\uBE14\uB85D(```)\uC740 \uC808\uB300 \uD3EC\uD568\uD558\uC9C0 \uB9C8\uB77C. \uCD9C\uB825 \uD615\uC2DD: [{"tmdb_id":123,"tags":["\uC5EC\uD589 \uC608\uB2A5"]}, ...]',w=`\uD0DC\uADF8 \uBAA9\uB85D: ${l.join(", ")}

\uC791\uD488 \uBAA9\uB85D:
${u}`,g=await fetch("https://api.anthropic.com/v1/messages",{method:"POST",headers:{"Content-Type":"application/json","x-api-key":t.ANTHROPIC_API_KEY,"anthropic-version":"2023-06-01"},body:JSON.stringify({model:"claude-haiku-4-5-20251001",max_tokens:2e3,system:E,messages:[{role:"user",content:w}]})});if(!g.ok){let T=await g.text().catch(()=>"");return new Response(JSON.stringify({ok:!1,message:`Claude API \uC624\uB958 (status ${g.status})`,detail:T.slice(0,300)}),{status:502,headers:e})}let k=((await g.json()).content||[]).filter(T=>T.type==="text").map(T=>T.text).join(""),O;try{let T=k.replace(/```json|```/g,"").trim();O=JSON.parse(T)}catch{return new Response(JSON.stringify({ok:!1,message:"Claude \uC751\uB2F5 \uD30C\uC2F1 \uC2E4\uD328 \u2014 \uB2E4\uC2DC \uC2DC\uB3C4\uD574\uC8FC\uC138\uC694",raw:k.slice(0,300)}),{status:502,headers:e})}Array.isArray(O)||(O=[]);let R=new Set(l),S=new Map;for(let T of O){let A=parseInt(T.tmdb_id);if(!A)continue;let L=Array.isArray(T.tags)?T.tags.filter(C=>R.has(C)).slice(0,2):[];S.set(A,L)}let h=[],b=0;for(let T of m){if(!S.has(T.tmdb_id))continue;let A=S.get(T.tmdb_id);h.push(t.DB.prepare("UPDATE works SET variety_genre = ?, variety_genre_source = 'auto' WHERE tmdb_id = ?").bind(A.length?A.join(","):null,T.tmdb_id)),b++}h.length&&await t.DB.batch(h);let N=await t.DB.prepare(`
        SELECT COUNT(*) as cnt FROM works
        WHERE original_language = 'ko' AND variety_genre_source IS NULL
          AND (genre LIKE '%Reality%' OR genre LIKE '%Talk%' OR genre LIKE '%\uB2E4\uD050\uBA58\uD130\uB9AC%' OR genre LIKE '%\uB9AC\uC5BC\uB9AC\uD2F0%' OR genre LIKE '%\uD1A0\uD06C%')
      `).first();return new Response(JSON.stringify({ok:!0,attempted:m.length,classified:b,remaining:N?.cnt||0}),{headers:e})}catch(s){return new Response(JSON.stringify({ok:!1,message:s.message}),{status:500,headers:e})}}if(r==="/admin/variety-genre-options"&&i.method==="GET"){if(!D(i,t))return new Response(JSON.stringify({ok:!1,message:"Unauthorized"}),{status:401,headers:e});try{let{results:s}=await t.DB.prepare("SELECT id, label, sort_order FROM variety_genre_options ORDER BY sort_order ASC").all();return new Response(JSON.stringify({ok:!0,data:s}),{headers:e})}catch(s){return new Response(JSON.stringify({ok:!1,message:s.message}),{status:500,headers:e})}}if(r==="/admin/works/variety-review"&&i.method==="GET"){if(!D(i,t))return new Response(JSON.stringify({ok:!1,message:"Unauthorized"}),{status:401,headers:e});try{let s=Math.min(parseInt(f.searchParams.get("limit"))||12,30),{results:a}=await t.DB.prepare(`
        SELECT tmdb_id, title_ko, poster_path, variety_genre, media_type
        FROM works
        WHERE variety_genre_source = 'auto'
        ORDER BY (variety_review_skipped_at IS NULL) DESC, variety_review_skipped_at ASC, tmdb_id ASC
        LIMIT ?
      `).bind(s).all(),d=await t.DB.prepare("SELECT COUNT(*) as cnt FROM works WHERE variety_genre_source = 'auto'").first();return new Response(JSON.stringify({ok:!0,items:a,remaining:d?.cnt||0}),{headers:e})}catch(s){return new Response(JSON.stringify({ok:!1,message:s.message}),{status:500,headers:e})}}if(r==="/admin/works/variety-review"&&i.method==="POST"){if(!D(i,t))return new Response(JSON.stringify({ok:!1,message:"Unauthorized"}),{status:401,headers:e});try{let s=await i.json().catch(()=>({})),d=(Array.isArray(s.items)?s.items:[]).filter(u=>u&&u.tmdb_id&&Array.isArray(u.tags));if(!d.length)return new Response(JSON.stringify({ok:!1,message:"\uC720\uD6A8\uD55C \uD56D\uBAA9\uC774 \uC5C6\uC5B4\uC694"}),{status:400,headers:e});let l=d.map(u=>{let E=u.tags.filter(Boolean).slice(0,2);return t.DB.prepare("UPDATE works SET variety_genre = ?, variety_genre_source = 'admin' WHERE tmdb_id = ?").bind(E.length?E.join(","):null,parseInt(u.tmdb_id))});await t.DB.batch(l);let m=await t.DB.prepare("SELECT COUNT(*) as cnt FROM works WHERE variety_genre_source = 'auto'").first();return new Response(JSON.stringify({ok:!0,updated:d.length,remaining:m?.cnt||0}),{headers:e})}catch(s){return new Response(JSON.stringify({ok:!1,message:s.message}),{status:500,headers:e})}}if(r==="/admin/works/variety-review/skip"&&i.method==="POST"){if(!D(i,t))return new Response(JSON.stringify({ok:!1,message:"Unauthorized"}),{status:401,headers:e});try{let s=await i.json().catch(()=>({})),a=Array.isArray(s.tmdb_ids)?s.tmdb_ids.map(m=>parseInt(m)).filter(m=>Number.isInteger(m)):[];if(!a.length)return new Response(JSON.stringify({ok:!1,message:"tmdb_ids required"}),{status:400,headers:e});let d=new Date().toISOString(),l=a.map(m=>t.DB.prepare("UPDATE works SET variety_review_skipped_at = ? WHERE tmdb_id = ?").bind(d,m));return await t.DB.batch(l),new Response(JSON.stringify({ok:!0,skipped:a.length}),{headers:e})}catch(s){return new Response(JSON.stringify({ok:!1,message:s.message}),{status:500,headers:e})}}if(r==="/admin/works/pinned-similar"&&i.method==="POST"){if(!D(i,t))return new Response(JSON.stringify({ok:!1,message:"Unauthorized"}),{status:401,headers:e});try{let s=await i.json().catch(()=>({})),a=parseInt(s.tmdb_id),d=parseInt(s.related_tmdb_id),l=parseInt(s.pinned_pct);if((!l||l<1||l>99)&&(l=99),!a||!d)return new Response(JSON.stringify({ok:!1,message:"\uB450 \uC791\uD488\uC758 tmdb_id\uAC00 \uBAA8\uB450 \uD544\uC694\uD569\uB2C8\uB2E4"}),{status:400,headers:e});if(a===d)return new Response(JSON.stringify({ok:!1,message:"\uAC19\uC740 \uC791\uD488\uB07C\uB9AC\uB294 \uC5F0\uACB0\uD560 \uC218 \uC5C6\uC5B4\uC694"}),{status:400,headers:e});let{results:m}=await t.DB.prepare("SELECT tmdb_id FROM works WHERE tmdb_id IN (?, ?)").bind(a,d).all();return m.length<2?new Response(JSON.stringify({ok:!1,message:"works \uD14C\uC774\uBE14\uC5D0 \uC5C6\uB294 \uC791\uD488\uC774 \uD3EC\uD568\uB418\uC5B4 \uC788\uC5B4\uC694"}),{status:400,headers:e}):(await t.DB.batch([t.DB.prepare(`
          INSERT INTO work_pinned_similar (tmdb_id, related_tmdb_id, pinned_pct)
          VALUES (?, ?, ?)
          ON CONFLICT(tmdb_id, related_tmdb_id) DO UPDATE SET pinned_pct = excluded.pinned_pct
        `).bind(a,d,l),t.DB.prepare(`
          INSERT INTO work_pinned_similar (tmdb_id, related_tmdb_id, pinned_pct)
          VALUES (?, ?, ?)
          ON CONFLICT(tmdb_id, related_tmdb_id) DO UPDATE SET pinned_pct = excluded.pinned_pct
        `).bind(d,a,l)]),new Response(JSON.stringify({ok:!0,pinned_pct:l}),{headers:e}))}catch(s){return new Response(JSON.stringify({ok:!1,message:s.message}),{status:500,headers:e})}}if(r.startsWith("/admin/works/pinned-similar/")&&i.method==="GET"){if(!D(i,t))return new Response(JSON.stringify({ok:!1,message:"Unauthorized"}),{status:401,headers:e});try{let s=parseInt(r.split("/admin/works/pinned-similar/")[1]);if(!s)return new Response(JSON.stringify({ok:!1,message:"tmdb_id required"}),{status:400,headers:e});let{results:a}=await t.DB.prepare(`
        SELECT w.tmdb_id, w.title_ko, w.title_en, w.poster_path, p.pinned_pct
        FROM work_pinned_similar p
        JOIN works w ON w.tmdb_id = p.related_tmdb_id
        WHERE p.tmdb_id = ?
        ORDER BY p.pinned_pct DESC
      `).bind(s).all();return new Response(JSON.stringify({ok:!0,data:a}),{headers:e})}catch(s){return new Response(JSON.stringify({ok:!1,message:s.message}),{status:500,headers:e})}}if(r==="/admin/works/pinned-similar"&&i.method==="DELETE"){if(!D(i,t))return new Response(JSON.stringify({ok:!1,message:"Unauthorized"}),{status:401,headers:e});try{let s=await i.json().catch(()=>({})),a=parseInt(s.tmdb_id),d=parseInt(s.related_tmdb_id);return!a||!d?new Response(JSON.stringify({ok:!1,message:"\uB450 \uC791\uD488\uC758 tmdb_id\uAC00 \uBAA8\uB450 \uD544\uC694\uD569\uB2C8\uB2E4"}),{status:400,headers:e}):(await t.DB.prepare(`
        DELETE FROM work_pinned_similar
        WHERE (tmdb_id = ? AND related_tmdb_id = ?) OR (tmdb_id = ? AND related_tmdb_id = ?)
      `).bind(a,d,d,a).run(),new Response(JSON.stringify({ok:!0}),{headers:e}))}catch(s){return new Response(JSON.stringify({ok:!1,message:s.message}),{status:500,headers:e})}}if(r==="/admin/persons/collect"&&i.method==="POST"){if(!D(i,t))return new Response(JSON.stringify({ok:!1,message:"Unauthorized"}),{status:401,headers:e});try{let s=await i.json().catch(()=>({})),a=Math.min(parseInt(s.limit)||20,50),{results:d}=await t.DB.prepare(`
        SELECT tmdb_id, media_type FROM works
        WHERE credits_scanned IS NULL OR credits_scanned = 0
        LIMIT ?
      `).bind(a).all();if(!d.length)return new Response(JSON.stringify({ok:!0,worksScanned:0,personsFound:0,remaining:0,message:"\uC2A4\uCE94\uD560 \uC791\uD488 \uC5C6\uC74C"}),{headers:e});let l=new Map,m=[];for(let w of d){m.push(w.tmdb_id);let g=w.media_type==="tv"?"tv":"movie",y=g==="tv"?"aggregate_credits":"credits";try{let k=await fetch(`https://api.themoviedb.org/3/${g}/${w.tmdb_id}/${y}?api_key=${t.TMDB_API_KEY}`);if(!k.ok)continue;let O=await k.json();for(let R of(O.cast||[]).slice(0,15))R.id&&R.name&&!l.has(R.id)&&l.set(R.id,{name:R.name,job:"act",popularity:R.popularity||null,profile_path:R.profile_path||null});for(let R of O.crew||[])(R.job==="Director"||R.job==="Creator"||R.department==="Directing"||(R.jobs||[]).some(h=>h.job==="Director"||h.job==="Creator"))&&R.id&&R.name&&l.set(R.id,{name:R.name,job:"direct",popularity:R.popularity||null,profile_path:R.profile_path||null})}catch{}}let u=[];for(let[w,g]of l)u.push(t.DB.prepare(`INSERT INTO persons (tmdb_id, name, job, popularity, profile_path) VALUES (?, ?, ?, ?, ?)
             ON CONFLICT(tmdb_id) DO NOTHING`).bind(w,g.name,g.job,g.popularity,g.profile_path));for(let w of m)u.push(t.DB.prepare("UPDATE works SET credits_scanned = 1 WHERE tmdb_id = ?").bind(w));u.length&&await t.DB.batch(u);let E=await t.DB.prepare("SELECT COUNT(*) as cnt FROM works WHERE credits_scanned IS NULL OR credits_scanned = 0").first();return new Response(JSON.stringify({ok:!0,worksScanned:d.length,personsFound:l.size,remaining:E?.cnt||0}),{headers:e})}catch(s){return new Response(JSON.stringify({ok:!1,message:s.message}),{status:500,headers:e})}}if(r==="/admin/persons/backfill-meta"&&i.method==="POST"){if(!D(i,t))return new Response(JSON.stringify({ok:!1,message:"Unauthorized"}),{status:401,headers:e});try{let s=await i.json().catch(()=>({})),a=Math.min(parseInt(s.limit)||20,50),{results:d}=await t.DB.prepare(`
        SELECT tmdb_id FROM persons
        WHERE birthday IS NULL OR has_korean_name IS NULL OR name_ko IS NULL
        LIMIT ?
      `).bind(a).all();if(!d.length)return new Response(JSON.stringify({ok:!0,processed:0,updated:0,remaining:0,message:"\uCC44\uC6B8 \uC778\uBB3C \uC5C6\uC74C"}),{headers:e});let l=[],m=0;for(let E of d)try{let w=await fetch(`https://api.themoviedb.org/3/person/${E.tmdb_id}?api_key=${t.TMDB_API_KEY}`);if(!w.ok){l.push(t.DB.prepare("UPDATE persons SET birthday = '', has_korean_name = 0, name_ko = '' WHERE tmdb_id = ?").bind(E.tmdb_id));continue}let g=await w.json(),y=g.also_known_as||[],k=g.place_of_birth||"",O=y.some(b=>/[가-힣]/.test(b)),R=k&&!/Korea|한국|Seoul|서울/i.test(k),S=O&&!R?1:0,h=y.find(b=>/[가-힣]/.test(b))||"";l.push(t.DB.prepare("UPDATE persons SET birthday = ?, popularity = ?, profile_path = ?, has_korean_name = ?, gender = ?, place_of_birth = ?, name_ko = ? WHERE tmdb_id = ?").bind(g.birthday||"",g.popularity||null,g.profile_path||null,S,g.gender||null,k||null,h,E.tmdb_id)),m++}catch{}l.length&&await t.DB.batch(l);let u=await t.DB.prepare("SELECT COUNT(*) as cnt FROM persons WHERE birthday IS NULL OR has_korean_name IS NULL OR name_ko IS NULL").first();return new Response(JSON.stringify({ok:!0,processed:d.length,updated:m,remaining:u?.cnt||0}),{headers:e})}catch(s){return new Response(JSON.stringify({ok:!1,message:s.message}),{status:500,headers:e})}}if(r==="/admin/persons/wiki-candidates"&&i.method==="GET"){if(!D(i,t))return new Response(JSON.stringify({ok:!1,message:"Unauthorized"}),{status:401,headers:e});try{let s=f.searchParams.get("sort")==="name"?"name":"popularity",a=Math.min(parseInt(f.searchParams.get("limit"))||50,100),d=Math.max(parseInt(f.searchParams.get("offset"))||0,0),l=f.searchParams.get("nationality")||"all",m=s==="name"?"p.name ASC":"p.popularity DESC NULLS LAST",u="";l==="korean"&&(u="AND p.has_korean_name = 1"),l==="foreign"&&(u="AND p.has_korean_name = 0");let{results:E}=await t.DB.prepare(`
        SELECT p.tmdb_id, p.name, p.job, p.birthday, p.popularity, p.profile_path,
               p.gender, p.place_of_birth, p.has_korean_name, p.name_ko
        FROM persons p
        LEFT JOIN person_wiki_cache w ON w.tmdb_person_id = p.tmdb_id
        WHERE w.tmdb_person_id IS NULL ${u}
        ORDER BY ${m}
        LIMIT ? OFFSET ?
      `).bind(a,d).all(),w=await t.DB.prepare(`
        SELECT COUNT(*) as cnt FROM persons p
        LEFT JOIN person_wiki_cache w ON w.tmdb_person_id = p.tmdb_id
        WHERE w.tmdb_person_id IS NULL ${u}
      `).first();return new Response(JSON.stringify({ok:!0,items:E,total:w?.cnt||0,offset:d,limit:a}),{headers:e})}catch(s){return new Response(JSON.stringify({ok:!1,message:s.message}),{status:500,headers:e})}}if(r==="/admin/persons/wiki-match-attempt"&&i.method==="POST"){if(!D(i,t))return new Response(JSON.stringify({ok:!1,message:"Unauthorized"}),{status:401,headers:e});try{let s=await i.json().catch(()=>({})),a=Array.isArray(s.tmdb_ids)?s.tmdb_ids.map(w=>parseInt(w)).filter(w=>Number.isInteger(w)).slice(0,50):[];if(!a.length)return new Response(JSON.stringify({ok:!1,message:"tmdb_ids\uAC00 \uD544\uC694\uD574\uC694"}),{status:400,headers:e});let d=a.map(()=>"?").join(","),{results:l}=await t.DB.prepare(`SELECT tmdb_id, name, name_ko, birthday, popularity, profile_path FROM persons WHERE tmdb_id IN (${d})`).bind(...a).all(),m=[],u=[],E={"User-Agent":"OttrankBot/1.0 (https://ottrank.kr; \uC624\uB728\uB791 \uC778\uBB3C \uC704\uD0A4\uB9E4\uCE6D)"};for(let w of l){let g=w.name_ko||w.name,y=(w.birthday||"").slice(0,4),k=null,O=null;try{let R=await fetch(`https://ko.wikipedia.org/w/api.php?action=opensearch&search=${encodeURIComponent(g)}&limit=5&namespace=0&format=json`,{headers:E});if(!R.ok)O=`\uAC80\uC0C9 \uC694\uCCAD \uC2E4\uD328 (HTTP ${R.status})`;else{let S=await R.json(),h=S[1]||[],b=S[3]||[];h.length||(O="\uC704\uD0A4\uBC31\uACFC \uAC80\uC0C9 \uACB0\uACFC \uC790\uCCB4\uAC00 \uC5C6\uC74C");let N=`${g} (\uBC30\uC6B0)`;h.includes(N)||(h.unshift(N),b.unshift(`https://ko.wikipedia.org/wiki/${encodeURIComponent(N.replace(/ /g,"_"))}`));for(let T=0;T<h.length;T++){let A=h[T],L=b[T],C=await fetch(`https://ko.wikipedia.org/w/api.php?action=query&titles=${encodeURIComponent(A)}&prop=extracts&exintro=1&explaintext=1&format=json`,{headers:E});if(!C.ok){O=`\uBCF8\uBB38 \uC870\uD68C \uC2E4\uD328 (HTTP ${C.status}, \uD6C4\uBCF4: ${A})`;continue}let I=await C.json(),F=I.query&&I.query.pages||{},H=Object.values(F)[0],M=H&&H.extract||"",W=M.match(/(\d{4})년/),U=W?W[1]:null,j=y&&U&&y===U,z=!y&&h.length===1;if(j||z){k={wiki_title:A,wiki_birth_year:U||"",wiki_summary:M.slice(0,200),wiki_source_url:L};break}T===h.length-1&&!k&&(O=`\uD6C4\uBCF4 ${h.length}\uAC1C \uD655\uC778\uD568(${h.join(", ")}) \u2014 \uC0DD\uB144\uB3C4 \uC77C\uCE58\uD558\uB294 \uD6C4\uBCF4 \uC5C6\uC74C(TMDB: ${y||"\uC5C6\uC74C"})`)}}}catch(R){O=`\uC694\uCCAD \uC911 \uC624\uB958: ${R.message}`}m.push({tmdb_id:w.tmdb_id,name_ko:w.name_ko||w.name,found:!!k,wiki_title:k?k.wiki_title:null,wiki_birth_year:k?k.wiki_birth_year:null,wiki_summary:k?k.wiki_summary:null,wiki_source_url:k?k.wiki_source_url:null,debug:k?null:O}),u.push(t.DB.prepare(`
            INSERT INTO person_wiki_match_queue
              (tmdb_person_id, person_name, popularity, profile_path, tmdb_birthday,
               wiki_title, wiki_birth_year, wiki_summary, wiki_source_url, match_found)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(tmdb_person_id) DO UPDATE SET
              wiki_title = excluded.wiki_title,
              wiki_birth_year = excluded.wiki_birth_year,
              wiki_summary = excluded.wiki_summary,
              wiki_source_url = excluded.wiki_source_url,
              match_found = excluded.match_found
          `).bind(w.tmdb_id,w.name_ko||w.name,w.popularity||null,w.profile_path||null,w.birthday||null,k?k.wiki_title:null,k?k.wiki_birth_year:null,k?k.wiki_summary:null,k?k.wiki_source_url:null,k?1:0))}return u.length&&await t.DB.batch(u),new Response(JSON.stringify({ok:!0,results:m}),{headers:e})}catch(s){return new Response(JSON.stringify({ok:!1,message:s.message}),{status:500,headers:e})}}if(r==="/admin/persons/wiki-approve"&&i.method==="POST"){if(!D(i,t))return new Response(JSON.stringify({ok:!1,message:"Unauthorized"}),{status:401,headers:e});try{let s=await i.json().catch(()=>({})),a=Array.isArray(s.tmdb_ids)?s.tmdb_ids.map(k=>parseInt(k)).filter(k=>Number.isInteger(k)).slice(0,50):[];if(!a.length)return new Response(JSON.stringify({ok:!1,message:"tmdb_ids\uAC00 \uD544\uC694\uD574\uC694"}),{status:400,headers:e});let d=a.map(()=>"?").join(","),{results:l}=await t.DB.prepare(`SELECT tmdb_person_id, person_name, wiki_title, wiki_source_url
         FROM person_wiki_match_queue
         WHERE tmdb_person_id IN (${d}) AND match_found = 1`).bind(...a).all(),m=[],u=[],E=[],w=k=>k?k.replace(/<ref[^>]*>[\s\S]*?<\/ref>/g,"").replace(/<ref[^>]*\/>/g,"").replace(/\[\[([^\|\]]+)\|([^\]]+)\]\]/g,"$2").replace(/\[\[([^\]]+)\]\]/g,"$1").replace(/'''?/g,"").replace(/<[^>]+>/g,"").replace(/\{\{[^}]*\}\}/g,"").trim():"",g=k=>{if(!k)return k;let O=/^(={2,6})\s*([^=\n]+?)\s*\1[ \t]*$/gm,R=[],S;for(;(S=O.exec(k))!==null;)R.push({index:S.index,headerEnd:S.index+S[0].length,level:S[1].length,title:S[2].trim()});if(!R.length)return k.trim();let h=k.slice(0,R[0].index).trim(),b=[];for(let N=0;N<R.length;N++){let T=R[N],A=R[N+1],L=k.slice(T.headerEnd,A?A.index:k.length).trim(),C=/^(학력|수상|수상내역|수상 경력)/.test(T.title);if(!L||C)continue;let I="=".repeat(T.level);b.push(`${I} ${T.title} ${I}
${L}`)}return[h,...b].filter(Boolean).join(`

`)},y={"User-Agent":"OttrankBot/1.0 (https://ottrank.kr; \uC624\uB728\uB791 \uC778\uBB3C \uC704\uD0A4\uB9E4\uCE6D)"};for(let k of l)try{let R=await(await fetch(`https://ko.wikipedia.org/w/api.php?action=query&titles=${encodeURIComponent(k.wiki_title)}&prop=extracts|revisions|extlinks&explaintext=1&rvprop=content&rvslots=main&ellimit=500&format=json`,{headers:y})).json(),S=R.query&&R.query.pages||{},h=Object.values(S)[0],b=h&&h.extract||"";if(!b){u.push({tmdb_id:k.tmdb_person_id,reason:"\uBCF8\uBB38 \uC870\uD68C \uC2E4\uD328"});continue}let N=b.split(`
`)[0].slice(0,500),T=b.match(/==+\s*수상[^=\n]*==+\n*([\s\S]*?)(?=\n==+\s|$)/),A=T?T[1].trim():"",L=A&&!/^==/.test(A)?A.slice(0,2e3):null,C=h&&h.revisions||[],F=(C[0]&&C[0].slots&&C[0].slots.main&&C[0].slots.main["*"]||"").match(/\{\{(?:배우 정보|연예인 정보|영화인 정보)[\s\S]*?\n\}\}/),H=F?F[0]:"",M=null,W=null,U=null;if(H){let Y=H.match(/\|\s*데뷔(?:작|년도)?(?:\([^)]*\))?\s*=\s*([^\|\n]+)/);if(Y){let X=w(Y[1]),Q=X.match(/(\d{4})/);W=Q?Q[1]:null,M=X.replace(/\(?\d{4}\)?[년,\s]*/g,"").trim().slice(0,100)||null}let x=H.match(/\|\s*학력(?:\([^)]*\))?\s*=\s*([^\|\n]+)/);x&&(U=w(x[1]).slice(0,200)||null)}if(!U){let Y=b.match(/==+\s*학력[^=\n]*==+\n*([\s\S]*?)(?=\n==+\s|$)/),x=Y?Y[1].trim():"";x&&!/^==/.test(x)&&(U=w(x.replace(/\n+/g," \xB7 ")).slice(0,300)||null)}let j=g(b).slice(0,8e3),z=h&&h.extlinks||[],V=null,q=null;for(let Y of z){let x=Y["*"]||"",X=x.match(/kmdb\.or\.kr\/db\/per\/(\d+)/);X&&(V=X[1]);let Q=x.match(/imdb\.com\/name\/(nm\d+)/);Q&&(q=Q[1])}E.push(t.DB.prepare(`
              INSERT INTO person_wiki_cache
                (tmdb_person_id, wiki_title, bio_summary, career_history, awards_text,
                 debut_work, debut_year, education, kmdb_id, imdb_id, source_url)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
              ON CONFLICT(tmdb_person_id) DO UPDATE SET
                wiki_title = excluded.wiki_title,
                bio_summary = excluded.bio_summary,
                career_history = excluded.career_history,
                awards_text = excluded.awards_text,
                debut_work = excluded.debut_work,
                debut_year = excluded.debut_year,
                education = excluded.education,
                kmdb_id = excluded.kmdb_id,
                imdb_id = excluded.imdb_id,
                source_url = excluded.source_url
            `).bind(k.tmdb_person_id,k.wiki_title,N,j,L,M,W,U,V,q,k.wiki_source_url)),m.push({tmdb_id:k.tmdb_person_id,person_name:k.person_name,wiki_title:k.wiki_title,debut_work:M,education:U,kmdb_id:V,imdb_id:q})}catch(O){u.push({tmdb_id:k.tmdb_person_id,reason:O.message})}return E.length&&await t.DB.batch(E),new Response(JSON.stringify({ok:!0,approved:m,failed:u,approvedCount:m.length}),{headers:e})}catch(s){return new Response(JSON.stringify({ok:!1,message:s.message}),{status:500,headers:e})}}if(r==="/admin/persons/search"&&i.method==="GET"){if(!D(i,t))return new Response(JSON.stringify({ok:!1,message:"Unauthorized"}),{status:401,headers:e});try{let s=(f.searchParams.get("q")||"").trim();if(!s)return new Response(JSON.stringify({ok:!0,items:[]}),{headers:e});let{results:a}=await t.DB.prepare(`
        SELECT p.tmdb_id, p.name, p.name_ko, p.job,
               CASE WHEN w.tmdb_person_id IS NULL THEN 0 ELSE 1 END AS matched
        FROM persons p
        LEFT JOIN person_wiki_cache w ON w.tmdb_person_id = p.tmdb_id
        WHERE p.name LIKE ? OR p.name_ko LIKE ?
        ORDER BY p.name LIMIT 30
      `).bind(`%${s}%`,`%${s}%`).all();return new Response(JSON.stringify({ok:!0,items:a}),{headers:e})}catch(s){return new Response(JSON.stringify({ok:!1,message:s.message}),{status:500,headers:e})}}if(r.match(/^\/admin\/persons\/wiki-detail\/\d+$/)&&i.method==="GET"){if(!D(i,t))return new Response(JSON.stringify({ok:!1,message:"Unauthorized"}),{status:401,headers:e});try{let s=parseInt(r.split("/")[4]),a=await t.DB.prepare("SELECT tmdb_id, name, name_ko, birthday, popularity, profile_path FROM persons WHERE tmdb_id = ?").bind(s).first();if(!a)return new Response(JSON.stringify({ok:!1,message:"\uC778\uBB3C\uC744 \uCC3E\uC744 \uC218 \uC5C6\uC5B4\uC694"}),{status:404,headers:e});let d=await t.DB.prepare(`SELECT tmdb_person_id, wiki_title, bio_summary, career_history, awards_text,
                debut_work, debut_year, education, kmdb_id, imdb_id, source_url, hidden_fields
         FROM person_wiki_cache WHERE tmdb_person_id = ?`).bind(s).first();if(!d)return new Response(JSON.stringify({ok:!0,matched:!1,person:a,wiki:{wiki_title:null,bio_summary:null,career_history:null,awards_text:null,debut_work:null,debut_year:null,education:null,kmdb_id:null,imdb_id:null,source_url:null},hiddenFields:[]}),{headers:e});let l=(d.hidden_fields||"").split(",").map(m=>m.trim()).filter(Boolean);return delete d.hidden_fields,new Response(JSON.stringify({ok:!0,matched:!0,person:a,wiki:d,hiddenFields:l}),{headers:e})}catch(s){return new Response(JSON.stringify({ok:!1,message:s.message}),{status:500,headers:e})}}if(r==="/admin/persons/wiki-manual-save"&&i.method==="POST"){if(!D(i,t))return new Response(JSON.stringify({ok:!1,message:"Unauthorized"}),{status:401,headers:e});try{let s=["bio_summary","career_history","awards_text","debut_work","education","kmdb_id","imdb_id"],a=await i.json().catch(()=>({})),d=parseInt(a.tmdb_id);if(!Number.isInteger(d))return new Response(JSON.stringify({ok:!1,message:"tmdb_id\uAC00 \uD544\uC694\uD574\uC694"}),{status:400,headers:e});let l=b=>typeof b=="string"&&b.trim()!==""?b.trim():null,m=l(a.wiki_title),u=l(a.bio_summary),E=l(a.career_history),w=l(a.awards_text),g=l(a.debut_work),y=l(a.debut_year),k=l(a.education),O=l(a.kmdb_id),R=l(a.imdb_id),S=l(a.source_url),h=Array.isArray(a.hidden_fields)?a.hidden_fields.filter(b=>s.includes(b)):[];return await t.DB.prepare(`
        INSERT INTO person_wiki_cache
          (tmdb_person_id, wiki_title, bio_summary, career_history, awards_text,
           debut_work, debut_year, education, kmdb_id, imdb_id, source_url, hidden_fields)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(tmdb_person_id) DO UPDATE SET
          wiki_title = excluded.wiki_title,
          bio_summary = excluded.bio_summary,
          career_history = excluded.career_history,
          awards_text = excluded.awards_text,
          debut_work = excluded.debut_work,
          debut_year = excluded.debut_year,
          education = excluded.education,
          kmdb_id = excluded.kmdb_id,
          imdb_id = excluded.imdb_id,
          source_url = excluded.source_url,
          hidden_fields = excluded.hidden_fields
      `).bind(d,m,u,E,w,g,y,k,O,R,S,h.join(",")).run(),new Response(JSON.stringify({ok:!0}),{headers:e})}catch(s){return new Response(JSON.stringify({ok:!1,message:s.message}),{status:500,headers:e})}}if(r==="/admin/persons/wiki-hidden-fields"&&i.method==="POST"){if(!D(i,t))return new Response(JSON.stringify({ok:!1,message:"Unauthorized"}),{status:401,headers:e});try{let s=["bio_summary","career_history","awards_text","debut_work","education","kmdb_id","imdb_id"],a=await i.json().catch(()=>({})),d=parseInt(a.tmdb_id);if(!Number.isInteger(d))return new Response(JSON.stringify({ok:!1,message:"tmdb_id\uAC00 \uD544\uC694\uD574\uC694"}),{status:400,headers:e});let l=Array.isArray(a.hidden_fields)?a.hidden_fields.filter(u=>s.includes(u)):[],m=await t.DB.prepare("UPDATE person_wiki_cache SET hidden_fields = ? WHERE tmdb_person_id = ?").bind(l.join(","),d).run();return!m.meta||m.meta.changes===0?new Response(JSON.stringify({ok:!1,message:"\uB9E4\uCE6D\uB41C \uC704\uD0A4 \uB370\uC774\uD130\uAC00 \uC5C6\uB294 \uC778\uBB3C\uC774\uC5D0\uC694"}),{status:404,headers:e}):new Response(JSON.stringify({ok:!0,hidden_fields:l}),{headers:e})}catch(s){return new Response(JSON.stringify({ok:!1,message:s.message}),{status:500,headers:e})}}if(r.match(/^\/admin\/persons\/\d+$/)&&i.method==="DELETE"){if(!D(i,t))return new Response(JSON.stringify({ok:!1,message:"Unauthorized"}),{status:401,headers:e});try{let s=parseInt(r.split("/")[3]);return await t.DB.prepare("DELETE FROM persons WHERE tmdb_id = ?").bind(s).run(),new Response(JSON.stringify({ok:!0}),{headers:e})}catch(s){return new Response(JSON.stringify({ok:!1,message:s.message}),{status:500,headers:e})}}if(r==="/admin/works/backfill-language"&&i.method==="POST"){if(!D(i,t))return new Response(JSON.stringify({ok:!1,message:"Unauthorized"}),{status:401,headers:e});try{let s=await i.json().catch(()=>({})),a=Math.min(parseInt(s.limit)||30,50),{results:d}=await t.DB.prepare(`
        SELECT tmdb_id, media_type FROM works
        WHERE original_language IS NULL
        LIMIT ?
      `).bind(a).all();if(!d.length)return new Response(JSON.stringify({ok:!0,attempted:0,filled:0,remaining:0,message:"\uCC44\uC6B8 \uC791\uD488 \uC5C6\uC74C"}),{headers:e});let l=[],m=0;for(let E of d){let w=E.media_type?[E.media_type]:["tv","movie"],g=null;for(let y of w)try{let k=await fetch(`https://api.themoviedb.org/3/${y}/${E.tmdb_id}?api_key=${t.TMDB_API_KEY}`);if(!k.ok)continue;let O=await k.json();if(O.original_language){g=O.original_language;break}}catch{}g?(l.push(t.DB.prepare("UPDATE works SET original_language = ? WHERE tmdb_id = ?").bind(g,E.tmdb_id)),m++):l.push(t.DB.prepare("UPDATE works SET original_language = 'unknown' WHERE tmdb_id = ?").bind(E.tmdb_id))}l.length&&await t.DB.batch(l);let u=await t.DB.prepare("SELECT COUNT(*) as cnt FROM works WHERE original_language IS NULL").first();return new Response(JSON.stringify({ok:!0,attempted:d.length,filled:m,remaining:u?.cnt||0}),{headers:e})}catch(s){return new Response(JSON.stringify({ok:!1,message:s.message}),{status:500,headers:e})}}if(r==="/admin/works/backfill-release-year"&&i.method==="POST"){if(!D(i,t))return new Response(JSON.stringify({ok:!1,message:"Unauthorized"}),{status:401,headers:e});try{let s=await i.json().catch(()=>({})),a=Math.min(parseInt(s.limit)||30,50),{results:d}=await t.DB.prepare(`
        SELECT tmdb_id, media_type FROM works
        WHERE release_year IS NULL
        LIMIT ?
      `).bind(a).all();if(!d.length)return new Response(JSON.stringify({ok:!0,attempted:0,filled:0,remaining:0,message:"\uCC44\uC6B8 \uC791\uD488 \uC5C6\uC74C"}),{headers:e});let l=[],m=0;for(let E of d){let w=E.media_type?[E.media_type]:["tv","movie"],g=null;for(let y of w)try{let k=await fetch(`https://api.themoviedb.org/3/${y}/${E.tmdb_id}?api_key=${t.TMDB_API_KEY}`);if(!k.ok)continue;let O=await k.json(),R=O.release_date||O.first_air_date||"",S=parseInt(R.slice(0,4));if(S){g=S;break}}catch{}g?(l.push(t.DB.prepare("UPDATE works SET release_year = ? WHERE tmdb_id = ?").bind(g,E.tmdb_id)),m++):l.push(t.DB.prepare("UPDATE works SET release_year = 0 WHERE tmdb_id = ?").bind(E.tmdb_id))}l.length&&await t.DB.batch(l);let u=await t.DB.prepare("SELECT COUNT(*) as cnt FROM works WHERE release_year IS NULL").first();return new Response(JSON.stringify({ok:!0,attempted:d.length,filled:m,remaining:u?.cnt||0}),{headers:e})}catch(s){return new Response(JSON.stringify({ok:!1,message:s.message}),{status:500,headers:e})}}if(r==="/admin/works/backfill-rating"&&i.method==="POST"){if(!D(i,t))return new Response(JSON.stringify({ok:!1,message:"Unauthorized"}),{status:401,headers:e});try{let s=await i.json().catch(()=>({})),a=Math.min(parseInt(s.limit)||30,50),{results:d}=await t.DB.prepare(`
        SELECT tmdb_id, media_type FROM works
        WHERE tmdb_rating IS NULL AND rating_updated_at IS NULL
        LIMIT ?
      `).bind(a).all();if(!d.length)return new Response(JSON.stringify({ok:!0,attempted:0,filled:0,remaining:0,message:"\uCC44\uC6B8 \uC791\uD488 \uC5C6\uC74C"}),{headers:e});let l=[],m=0,u=new Date().toISOString();for(let w of d){let g=w.media_type?[w.media_type]:["tv","movie"],y=null,k=null,O=!1;for(let R of g)try{let S=await fetch(`https://api.themoviedb.org/3/${R}/${w.tmdb_id}?api_key=${t.TMDB_API_KEY}`);if(!S.ok)continue;let h=await S.json();O=!0,y=h.vote_average??null,k=h.release_date||h.first_air_date||null;break}catch{}O?(l.push(t.DB.prepare("UPDATE works SET tmdb_rating = ?, release_date = ?, rating_updated_at = ? WHERE tmdb_id = ?").bind(y,k,u,w.tmdb_id)),y!==null&&m++):l.push(t.DB.prepare("UPDATE works SET rating_updated_at = ? WHERE tmdb_id = ?").bind(u,w.tmdb_id))}l.length&&await t.DB.batch(l);let E=await t.DB.prepare("SELECT COUNT(*) as cnt FROM works WHERE tmdb_rating IS NULL AND rating_updated_at IS NULL").first();return new Response(JSON.stringify({ok:!0,attempted:d.length,filled:m,remaining:E?.cnt||0}),{headers:e})}catch(s){return new Response(JSON.stringify({ok:!1,message:s.message}),{status:500,headers:e})}}if(r==="/admin/works/batch-imdb-search"&&i.method==="POST"){if(!D(i,t))return new Response(JSON.stringify({ok:!1,message:"Unauthorized"}),{status:401,headers:e});try{let s=30;try{let g=await i.json();g?.limit&&Number.isInteger(g.limit)&&g.limit>0&&(s=g.limit)}catch{}let a=t.OMDB_API_KEY;if(!a)return new Response(JSON.stringify({ok:!1,message:"OMDB key not configured"}),{status:500,headers:e});let l=(await t.DB.prepare("SELECT value AS latest_date FROM app_settings WHERE key = 'latest_ranking_date'").first())?.latest_date||null,{results:m}=await t.DB.prepare(`
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
      `).bind(l,s).all();if(!m.length)return new Response(JSON.stringify({ok:!0,attempted:0,filled:0,remaining:0,message:"\uB300\uC0C1 \uC791\uD488 \uC5C6\uC74C (\uBAA8\uB450 \uB9E4\uCE6D \uC644\uB8CC\uB410\uAC70\uB098 \uCFE8\uB2E4\uC6B4 \uC911)"}),{headers:e});let u=0,E=new Date().toISOString();for(let g of m)try{if(!g.title_en){await t.DB.prepare("UPDATE works SET imdb_search_attempted_at = ? WHERE tmdb_id = ?").bind(E,g.tmdb_id).run();continue}let y=g.media_type==="movie"?"movie":"series",k=new URLSearchParams({t:g.title_en,type:y,apikey:a});g.release_year&&k.set("y",String(g.release_year));let R=await(await fetch(`https://www.omdbapi.com/?${k.toString()}`)).json();if(R.Response!=="False"&&/^tt\d+$/.test(R.imdbID||"")){let S=parseFloat(R.imdbRating);if(isNaN(S))await t.DB.prepare("UPDATE works SET imdb_id = ?, imdb_search_attempted_at = ? WHERE tmdb_id = ?").bind(R.imdbID,E,g.tmdb_id).run();else{let h=R.imdbVotes||"";await t.DB.prepare("UPDATE works SET imdb_id = ?, imdb_rating = ?, imdb_votes = ?, imdb_updated = ?, imdb_search_attempted_at = ? WHERE tmdb_id = ?").bind(R.imdbID,S,h,E,E,g.tmdb_id).run()}u++}else await t.DB.prepare("UPDATE works SET imdb_search_attempted_at = ? WHERE tmdb_id = ?").bind(E,g.tmdb_id).run()}catch(y){console.error(`[IMDB_BATCH_SEARCH] tmdb_id=${g.tmdb_id} \uC624\uB958:`,y.message)}let w=await t.DB.prepare(`
        SELECT COUNT(*) AS cnt FROM works w
        WHERE (w.imdb_id IS NULL OR w.imdb_id = '')
        AND (
          w.imdb_search_attempted_at IS NULL
          OR w.imdb_search_attempted_at < datetime('now', '-7 days')
        )
      `).first();return console.log(`[IMDB_BATCH_SEARCH] \u2705 \uC644\uB8CC: \uC2DC\uB3C4 ${m.length}\uAC74, \uB9E4\uCE6D ${u}\uAC1C`),new Response(JSON.stringify({ok:!0,attempted:m.length,filled:u,remaining:w?.cnt||0}),{headers:e})}catch(s){return new Response(JSON.stringify({ok:!1,message:s.message}),{status:500,headers:e})}}if(r==="/admin/works/imdb-manual"&&i.method==="POST"){if(!D(i,t))return new Response(JSON.stringify({ok:!1,message:"Unauthorized"}),{status:401,headers:e});try{let s=await i.json(),a=parseInt(s?.tmdb_id);if(!a)return new Response(JSON.stringify({ok:!1,message:"tmdb_id required"}),{status:400,headers:e});let d=s?.imdb_rating===""||s?.imdb_rating==null?null:parseFloat(s.imdb_rating);if(d!==null&&(isNaN(d)||d<0||d>10))return new Response(JSON.stringify({ok:!1,message:"imdb_rating\uC740 0~10 \uC0AC\uC774 \uC22B\uC790\uC5EC\uC57C \uD569\uB2C8\uB2E4"}),{status:400,headers:e});let l=(s?.imdb_votes||"").toString().trim()||null,m=await t.DB.prepare("SELECT imdb_id FROM works WHERE tmdb_id = ?").bind(a).first();return m?(await t.DB.prepare("UPDATE works SET imdb_rating = ?, imdb_votes = ?, imdb_updated = datetime('now') WHERE tmdb_id = ?").bind(d,l,a).run(),new Response(JSON.stringify({ok:!0,warning:m.imdb_id?null:"imdb_id\uAC00 \uC5C6\uB294 \uC791\uD488\uC774\uB77C \uD654\uBA74\uC5D0 \uCE74\uB4DC\uAC00 \uC548 \uB730 \uC218 \uC788\uC2B5\uB2C8\uB2E4 (IMDb \uB9E4\uCE6D \uBC30\uCE58 \uC120\uD589 \uD544\uC694)"}),{headers:e})):new Response(JSON.stringify({ok:!1,message:"\uD574\uB2F9 tmdb_id \uC791\uD488\uC744 \uCC3E\uC744 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4"}),{status:404,headers:e})}catch(s){return new Response(JSON.stringify({ok:!1,message:s.message}),{status:500,headers:e})}}if(r==="/admin/works/missing-media-type"&&i.method==="GET"){if(!D(i,t))return new Response(JSON.stringify({ok:!1,message:"Unauthorized"}),{status:401,headers:e});try{let s=Math.min(parseInt(f.searchParams.get("limit"))||10,30),{results:a}=await t.DB.prepare(`
        SELECT tmdb_id, title_ko, poster_path
        FROM works
        WHERE media_type IS NULL OR media_type = ''
        ORDER BY tmdb_id
        LIMIT ?
      `).bind(s).all(),d=await t.DB.prepare("SELECT COUNT(*) as cnt FROM works WHERE media_type IS NULL OR media_type = ''").first();return new Response(JSON.stringify({ok:!0,items:a,remaining:d?.cnt||0}),{headers:e})}catch(s){return new Response(JSON.stringify({ok:!1,message:s.message}),{status:500,headers:e})}}if(r==="/admin/works/bulk-set-media-type"&&i.method==="POST"){if(!D(i,t))return new Response(JSON.stringify({ok:!1,message:"Unauthorized"}),{status:401,headers:e});try{let s=await i.json().catch(()=>({})),d=(Array.isArray(s.items)?s.items:[]).filter(u=>u&&u.tmdb_id&&(u.media_type==="movie"||u.media_type==="tv"));if(!d.length)return new Response(JSON.stringify({ok:!1,message:"\uC720\uD6A8\uD55C \uD56D\uBAA9\uC774 \uC5C6\uC5B4\uC694 (media_type\uC740 'movie' \uB610\uB294 'tv'\uB9CC \uD5C8\uC6A9)"}),{status:400,headers:e});let l=d.map(u=>t.DB.prepare("UPDATE works SET media_type = ? WHERE tmdb_id = ?").bind(u.media_type,parseInt(u.tmdb_id)));await t.DB.batch(l);let m=await t.DB.prepare("SELECT COUNT(*) as cnt FROM works WHERE media_type IS NULL OR media_type = ''").first();return new Response(JSON.stringify({ok:!0,updated:d.length,remaining:m?.cnt||0}),{headers:e})}catch(s){return new Response(JSON.stringify({ok:!1,message:s.message}),{status:500,headers:e})}}if(r==="/admin/grade-settings"&&i.method==="GET"){if(!D(i,t))return new Response(JSON.stringify({ok:!1,message:"Unauthorized"}),{status:401,headers:e});try{let{results:s}=await t.DB.prepare("SELECT * FROM grade_settings ORDER BY sort_order ASC").all();return new Response(JSON.stringify({ok:!0,data:s}),{headers:e})}catch(s){return new Response(JSON.stringify({ok:!1,message:s.message}),{status:500,headers:e})}}if(r==="/admin/grade-settings"&&i.method==="PUT"){if(!D(i,t))return new Response(JSON.stringify({ok:!1,message:"Unauthorized"}),{status:401,headers:e});try{let s=await i.json();if(!Array.isArray(s))return new Response(JSON.stringify({ok:!1,message:"Array required"}),{status:400,headers:e});for(let a of s)await t.DB.prepare(`
          INSERT INTO grade_settings
            (grade_key, grade_name, emoji_url, min_ott_points, is_special, sort_order)
          VALUES (?, ?, ?, ?, ?, ?)
          ON CONFLICT(grade_key) DO UPDATE SET
            grade_name     = excluded.grade_name,
            emoji_url      = excluded.emoji_url,
            min_ott_points = excluded.min_ott_points,
            is_special     = excluded.is_special,
            sort_order     = excluded.sort_order
        `).bind(a.grade_key,a.grade_name,a.emoji_url||"",a.min_ott_points||0,a.is_special?1:0,a.sort_order||0).run();return new Response(JSON.stringify({ok:!0}),{headers:e})}catch(s){return new Response(JSON.stringify({ok:!1,message:s.message}),{status:500,headers:e})}}if(r==="/admin/grade-settings/assign"&&i.method==="POST"){if(!D(i,t))return new Response(JSON.stringify({ok:!1,message:"Unauthorized"}),{status:401,headers:e});try{let{user_id:s,grade_key:a}=await i.json();return!s||!a?new Response(JSON.stringify({ok:!1,message:"user_id, grade_key required"}),{status:400,headers:e}):(await t.DB.prepare("UPDATE users SET grade = ? WHERE id = ?").bind(a,s).run(),new Response(JSON.stringify({ok:!0}),{headers:e}))}catch(s){return new Response(JSON.stringify({ok:!1,message:s.message}),{status:500,headers:e})}}if(r==="/admin/users"&&i.method==="GET"){if(!D(i,t))return new Response(JSON.stringify({ok:!1,message:"Unauthorized"}),{status:401,headers:e});try{let s=parseInt(f.searchParams.get("page")||"1"),a=50,d=(s-1)*a,l=f.searchParams.get("q")||"",m=`
        SELECT u.id, u.nickname, u.provider, u.grade, u.total_likes_received,
          u.created_at, u.last_login, u.ott_points,
          gs.grade_name, gs.emoji_url as grade_emoji_url,
          (SELECT COUNT(*) FROM reviews  WHERE user_id = u.id) as review_count,
          (SELECT COUNT(*) FROM wishlist WHERE user_id = u.id) as wishlist_count,
          (SELECT COUNT(*) FROM posts    WHERE user_id = u.id) as post_count
        FROM users u
        LEFT JOIN grade_settings gs ON gs.grade_key = u.grade
      `,u=[];l&&(m+=" WHERE u.nickname LIKE ?",u.push(`%${l}%`)),m+=" ORDER BY u.created_at DESC LIMIT ? OFFSET ?",u.push(a,d);let{results:E}=await t.DB.prepare(m).bind(...u).all();return new Response(JSON.stringify({ok:!0,data:E}),{headers:e})}catch(s){return new Response(JSON.stringify({ok:!1,message:s.message}),{status:500,headers:e})}}if(r==="/admin/ott-points/adjust"&&i.method==="POST"){if(!D(i,t))return new Response(JSON.stringify({ok:!1,message:"Unauthorized"}),{status:401,headers:e});try{let{user_id:s,points:a,reason:d}=await i.json();if(!s||a===void 0||!d)return new Response(JSON.stringify({ok:!1,message:"user_id, points, reason \uD544\uC218"}),{status:400,headers:e});await t.DB.prepare("INSERT INTO user_point_logs (user_id, points, reason) VALUES (?, ?, ?)").bind(s,a,d).run(),await t.DB.prepare("UPDATE users SET ott_points = MAX(0, COALESCE(ott_points, 0) + ?) WHERE id = ?").bind(a,s).run();let l=await t.DB.prepare("SELECT ott_points FROM users WHERE id = ?").bind(s).first();if(l){let m=await Vt(l.ott_points,t);m&&await t.DB.prepare("UPDATE users SET grade = ? WHERE id = ? AND (grade IS NULL OR grade NOT IN (SELECT grade_key FROM grade_settings WHERE is_special = 1))").bind(m,s).run()}return new Response(JSON.stringify({ok:!0}),{headers:e})}catch(s){return new Response(JSON.stringify({ok:!1,message:s.message}),{status:500,headers:e})}}if(r==="/admin/search-logs"&&i.method==="GET"){if(!await D(i,t))return new Response(JSON.stringify({ok:!1,message:"Unauthorized"}),{status:401,headers:e});try{let a=Math.max(parseInt(f.searchParams.get("page")||"1",10),1),d=Math.min(Math.max(parseInt(f.searchParams.get("limit")||"50",10),1),200),l=(a-1)*d,[{results:m},u]=await Promise.all([t.DB.prepare(`SELECT id, query, result_count, total_count, created_at FROM search_logs
           ORDER BY created_at DESC LIMIT ? OFFSET ?`).bind(d,l).all(),t.DB.prepare("SELECT COUNT(*) AS cnt FROM search_logs").first()]),E=u?.cnt||0;return new Response(JSON.stringify({ok:!0,data:m,page:a,limit:d,total:E,has_more:l+m.length<E}),{headers:e})}catch(a){return new Response(JSON.stringify({ok:!1,message:a.message}),{status:500,headers:e})}}return null}async function Vt(r,i){try{let{results:t}=await i.DB.prepare(`SELECT grade_key FROM grade_settings
       WHERE is_special = 0 AND min_ott_points <= ?
       ORDER BY min_ott_points DESC LIMIT 1`).bind(r).all();return t[0]?.grade_key||null}catch{return null}}async function Et(r,i,t,f,e){let o=i.method;try{if(o==="GET"&&r==="/contents")return Xt(f,t,e);if(o==="GET"&&r==="/contents/pinned")return Qt(t,e);if(o==="GET"&&r==="/contents/list")return Zt(f,t,e);let n=r.match(/^\/contents\/video\/(\d+)$/);if(o==="GET"&&n)return vt(n[1],t,e);let p=r.match(/^\/contents\/comments\/(\d+)$/);if(o==="GET"&&p)return qt(p[1],t,e);if(o==="POST"&&r==="/contents/comments")return te(i,t,e);let _=r.match(/^\/contents\/comments\/(\d+)$/);if(o==="DELETE"&&_)return ee(_[1],i,t,e);if(o==="PATCH"&&r==="/admin/contents/pinned/reorder")return oe(i,t,e);if(o==="GET"&&r==="/admin/contents/check")return ie(f,i,t,e);if(o==="GET"&&r==="/admin/contents")return se(f,i,t,e);if(o==="POST"&&r==="/admin/contents")return ae(i,t,e);let c=r.match(/^\/admin\/contents\/(\d+)$/);if(o==="PUT"&&c)return re(c[1],i,t,e);let s=r.match(/^\/admin\/contents\/(\d+)$/);return o==="DELETE"&&s?ne(s[1],i,t,e):null}catch(n){return console.error("[contents] \uC624\uB958:",n),new Response(JSON.stringify({ok:!1,error:"\uC11C\uBC84 \uC624\uB958\uAC00 \uBC1C\uC0DD\uD588\uC2B5\uB2C8\uB2E4."}),{status:500,headers:e})}}function J(r,i=200,t={}){return new Response(JSON.stringify(r),{status:i,headers:{"Content-Type":"application/json",...t}})}function K(r,i){return(r.headers.get("Authorization")||"").replace("Bearer ","").trim()===i.ADMIN_SECRET}async function wt(r,i,t,f,e){if(!r||!t)return;let o=await e.DB.prepare("SELECT media_type FROM works WHERE tmdb_id = ?").bind(r).first();if(!o){console.log(`[CONTENTS_LINK] tmdb_id=${r} works\uC5D0 \uC5C6\uC74C \u2014 title_videos \uBCF5\uC0AC \uC2A4\uD0B5`);return}if(!i||o.media_type!==i){console.log(`[CONTENTS_LINK] tmdb_id=${r} \uD0C0\uC785 \uBD88\uC77C\uCE58(works=${o.media_type}, ott_contents=${i}) \u2014 title_videos \uBCF5\uC0AC \uC2A4\uD0B5`);return}await e.DB.prepare(`
    INSERT OR IGNORE INTO title_videos (tmdb_id, youtube_url, youtube_id, title, is_main)
    VALUES (?, ?, ?, ?, 0)
  `).bind(r,`https://www.youtube.com/watch?v=${t}`,t,f||"").run(),console.log(`[CONTENTS_LINK] \u2705 tmdb_id=${r} youtube_id=${t} title_videos \uBCF5\uC0AC \uC644\uB8CC`)}async function Xt(r,i,t){let f=r.searchParams.get("platform"),e=r.searchParams.get("type"),o=Math.min(parseInt(r.searchParams.get("limit")||"20"),50),n=["is_hidden = 0"],p=[];f&&(n.push("platform = ?"),p.push(f)),e&&(n.push("type = ?"),p.push(e));let _=n.join(" AND ");p.push(o);let{results:c}=await i.DB.prepare(`SELECT id, youtube_id, platform, type, title, work_title,
            tmdb_id, tmdb_type, thumbnail, published_at, view_count, is_pinned
     FROM ott_contents
     WHERE ${_}
     ORDER BY published_at DESC
     LIMIT ?`).bind(...p).all();return J({ok:!0,items:c??[]},200,t)}async function Qt(r,i){let{results:t}=await r.DB.prepare(`SELECT id, youtube_id, platform, type, title, work_title,
            tmdb_id, tmdb_type, thumbnail, published_at, view_count,
            is_pinned, sort_order
     FROM ott_contents
     WHERE is_pinned = 1 AND is_hidden = 0
     ORDER BY sort_order ASC
     LIMIT 5`).all();return J({ok:!0,items:t??[]},200,i)}async function Zt(r,i,t){let f=r.searchParams.get("platform"),e=r.searchParams.get("type"),o=Math.max(parseInt(r.searchParams.get("page")||"1"),1),n=30,p=(o-1)*n,_=["is_hidden = 0"],c=[];f&&(_.push("platform = ?"),c.push(f)),e&&(_.push("type = ?"),c.push(e));let s=_.join(" AND "),a=[...c],d=[...c,n,p],[l,m]=await i.DB.batch([i.DB.prepare(`SELECT COUNT(*) as total FROM ott_contents WHERE ${s}`).bind(...a),i.DB.prepare(`SELECT id, youtube_id, platform, type, title, work_title,
              tmdb_id, tmdb_type, thumbnail, published_at, view_count
       FROM ott_contents
       WHERE ${s}
       ORDER BY published_at DESC
       LIMIT ? OFFSET ?`).bind(...d)]),u=l.results?.[0]?.total??0,E=m.results??[];return J({ok:!0,items:E,pagination:{page:o,pageSize:n,total:u,totalPages:Math.ceil(u/n)}},200,t)}async function vt(r,i,t){let f=await i.DB.prepare(`SELECT id, youtube_id, platform, type, title, work_title,
            tmdb_id, tmdb_type, thumbnail, published_at, view_count,
            is_pinned, created_at
     FROM ott_contents
     WHERE id = ? AND is_hidden = 0`).bind(r).first();return f?(i.DB.prepare("UPDATE ott_contents SET view_count = view_count + 1 WHERE id = ?").bind(r).run(),J({ok:!0,item:f},200,t)):J({ok:!1,error:"\uC601\uC0C1\uC744 \uCC3E\uC744 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4."},404,t)}async function qt(r,i,t){let{results:f}=await i.DB.prepare(`SELECT c.id, c.body, c.created_at,
            u.id AS user_id,
            u.nickname,
            u.profile_image
     FROM ott_content_comments c
     JOIN users u ON c.user_id = u.id
     WHERE c.content_id = ? AND c.is_hidden = 0
     ORDER BY c.created_at ASC`).bind(r).all();return J({ok:!0,comments:f??[]},200,t)}async function te(r,i,t){let f=r.headers.get("Authorization")||"",e=f.startsWith("Bearer ")?f.slice(7).trim():null,o=B(r),n=e||o;if(!n)return J({ok:!1,error:"\uB85C\uADF8\uC778\uC774 \uD544\uC694\uD569\uB2C8\uB2E4."},401,t);let p=await i.DB.prepare(`SELECT s.user_id AS id, u.nickname
     FROM sessions s
     JOIN users u ON u.id = s.user_id
     WHERE s.id = ?
     LIMIT 1`).bind(n).first();if(!p)return J({ok:!1,error:"\uB85C\uADF8\uC778\uC774 \uD544\uC694\uD569\uB2C8\uB2E4."},401,t);let _;try{_=await r.json()}catch{return J({ok:!1,error:"\uC798\uBABB\uB41C \uC694\uCCAD \uD615\uC2DD\uC785\uB2C8\uB2E4."},400,t)}let{content_id:c,body:s}=_;if(!c||!s?.trim())return J({ok:!1,error:"content_id\uC640 \uB313\uAE00 \uB0B4\uC6A9\uC774 \uD544\uC694\uD569\uB2C8\uB2E4."},400,t);if(s.trim().length>500)return J({ok:!1,error:"\uB313\uAE00\uC740 500\uC790 \uC774\uB0B4\uB85C \uC785\uB825\uD574\uC8FC\uC138\uC694."},400,t);if(!await i.DB.prepare("SELECT id FROM ott_contents WHERE id = ? AND is_hidden = 0").bind(c).first())return J({ok:!1,error:"\uC601\uC0C1\uC744 \uCC3E\uC744 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4."},404,t);let d=await i.DB.prepare(`INSERT INTO ott_content_comments (content_id, user_id, body)
     VALUES (?, ?, ?)`).bind(c,p.id,s.trim()).run();return J({ok:!0,id:d.meta?.last_row_id},200,t)}async function ee(r,i,t,f){let e=i.headers.get("Authorization")||"",o=e.startsWith("Bearer ")?e.slice(7).trim():null,n=B(i),p=o||n;if(!p)return J({ok:!1,error:"\uB85C\uADF8\uC778\uC774 \uD544\uC694\uD569\uB2C8\uB2E4."},401,f);let _=await t.DB.prepare("SELECT s.user_id AS id FROM sessions s WHERE s.id = ? LIMIT 1").bind(p).first();if(!_)return J({ok:!1,error:"\uB85C\uADF8\uC778\uC774 \uD544\uC694\uD569\uB2C8\uB2E4."},401,f);let c=await t.DB.prepare("SELECT id, user_id FROM ott_content_comments WHERE id = ?").bind(r).first();return c?c.user_id!==_.id?J({ok:!1,error:"\uBCF8\uC778 \uB313\uAE00\uB9CC \uC0AD\uC81C\uD560 \uC218 \uC788\uC2B5\uB2C8\uB2E4."},403,f):(await t.DB.prepare("DELETE FROM ott_content_comments WHERE id = ?").bind(r).run(),J({ok:!0},200,f)):J({ok:!1,error:"\uB313\uAE00\uC744 \uCC3E\uC744 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4."},404,f)}async function se(r,i,t,f){if(!K(i,t))return J({ok:!1,error:"\uAD8C\uD55C\uC774 \uC5C6\uC2B5\uB2C8\uB2E4."},403,f);let e=r.searchParams.get("platform"),o=r.searchParams.get("type"),n=(r.searchParams.get("q")||"").trim(),p=Math.max(parseInt(r.searchParams.get("page")||"1"),1),_=50,c=(p-1)*_,s=["1=1"],a=[];if(e&&(s.push("platform = ?"),a.push(e)),o&&(s.push("type = ?"),a.push(o)),n){let y=n.replace(/\s+/g,"");s.push("(REPLACE(work_title, ' ', '') LIKE ? OR REPLACE(title, ' ', '') LIKE ?)"),a.push(`%${y}%`,`%${y}%`)}let d=s.join(" AND "),l=[...a],m=[...a,_,c],[u,E]=await t.DB.batch([t.DB.prepare(`SELECT COUNT(*) as total FROM ott_contents WHERE ${d}`).bind(...l),t.DB.prepare(`SELECT id, youtube_id, platform, type, title, work_title,
              tmdb_id, tmdb_type, thumbnail, published_at,
              view_count, is_pinned, is_hidden, sort_order, created_at
       FROM ott_contents
       WHERE ${d}
       ORDER BY published_at DESC
       LIMIT ? OFFSET ?`).bind(...m)]),w=u.results?.[0]?.total??0,g=E.results??[];return J({ok:!0,items:g,pagination:{page:p,pageSize:_,total:w,totalPages:Math.ceil(w/_)}},200,f)}async function ie(r,i,t,f){if(!K(i,t))return J({ok:!1,error:"\uAD8C\uD55C\uC774 \uC5C6\uC2B5\uB2C8\uB2E4."},403,f);let e=r.searchParams.get("youtube_id");if(!e)return J({ok:!1,error:"youtube_id\uAC00 \uD544\uC694\uD569\uB2C8\uB2E4."},400,f);let o=await t.DB.prepare("SELECT id FROM ott_contents WHERE youtube_id = ?").bind(e).first();return J({ok:!0,exists:!!o},200,f)}async function ae(r,i,t){if(!K(r,i))return J({ok:!1,error:"\uAD8C\uD55C\uC774 \uC5C6\uC2B5\uB2C8\uB2E4."},403,t);let f;try{f=await r.json()}catch{return J({ok:!1,error:"\uC798\uBABB\uB41C \uC694\uCCAD \uD615\uC2DD\uC785\uB2C8\uB2E4."},400,t)}let{youtube_id:e,platform:o,type:n="trailer",title:p,work_title:_,tmdb_id:c,tmdb_type:s,thumbnail:a,published_at:d}=f;if(!e||!o||!p||!d)return J({ok:!1,error:"youtube_id, platform, title, published_at\uB294 \uD544\uC218\uC785\uB2C8\uB2E4."},400,t);if(!["netflix","tving","disney","coupang","wavve","boxoffice","etc"].includes(o))return J({ok:!1,error:"\uC720\uD6A8\uD558\uC9C0 \uC54A\uC740 \uD50C\uB7AB\uD3FC\uC785\uB2C8\uB2E4."},400,t);if(!["trailer","teaser","preview","release"].includes(n))return J({ok:!1,error:"\uC720\uD6A8\uD558\uC9C0 \uC54A\uC740 \uD0C0\uC785\uC785\uB2C8\uB2E4."},400,t);try{let u=await i.DB.prepare(`INSERT INTO ott_contents
         (youtube_id, platform, type, title, work_title,
          tmdb_id, tmdb_type, thumbnail, published_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`).bind(e,o,n,p,_||null,c||null,s||null,a||null,d).run();if(c&&_)try{await i.DB.prepare(`INSERT OR IGNORE INTO works (tmdb_id, media_type, title_ko, match_source)
           VALUES (?, ?, ?, 'crawler')`).bind(c,s||null,_).run()}catch(E){console.error("[contents] works \uC790\uB3D9\uB4F1\uB85D \uC2E4\uD328(\uBB34\uC2DC):",E.message)}if(c)try{await wt(c,s||null,e,p,i)}catch(E){console.error("[contents] title_videos \uBCF5\uC0AC \uC2E4\uD328(\uBB34\uC2DC):",E.message)}return J({ok:!0,id:u.meta?.last_row_id},200,t)}catch(u){if(u.message?.includes("UNIQUE"))return J({ok:!1,error:"\uC774\uBBF8 \uB4F1\uB85D\uB41C YouTube \uC601\uC0C1\uC785\uB2C8\uB2E4."},409,t);throw u}}async function re(r,i,t,f){if(!K(i,t))return J({ok:!1,error:"\uAD8C\uD55C\uC774 \uC5C6\uC2B5\uB2C8\uB2E4."},403,f);let e;try{e=await i.json()}catch{return J({ok:!1,error:"\uC798\uBABB\uB41C \uC694\uCCAD \uD615\uC2DD\uC785\uB2C8\uB2E4."},400,f)}let o=await t.DB.prepare("SELECT id, youtube_id, title, tmdb_type FROM ott_contents WHERE id = ?").bind(r).first();if(!o)return J({ok:!1,error:"\uC601\uC0C1\uC744 \uCC3E\uC744 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4."},404,f);let n=["work_title","tmdb_id","tmdb_type","type","is_pinned","is_hidden","sort_order"],p=[],_=[];for(let c of n)e[c]!==void 0&&(p.push(`${c} = ?`),_.push(e[c]));if(p.length===0)return J({ok:!1,error:"\uC218\uC815\uD560 \uAC12\uC774 \uC5C6\uC2B5\uB2C8\uB2E4."},400,f);if(_.push(r),await t.DB.prepare(`UPDATE ott_contents SET ${p.join(", ")} WHERE id = ?`).bind(..._).run(),e.tmdb_id!==void 0)try{let c=e.tmdb_type!==void 0?e.tmdb_type:o.tmdb_type;await wt(e.tmdb_id,c,o.youtube_id,o.title,t)}catch(c){console.error("[contents] title_videos \uBCF5\uC0AC \uC2E4\uD328(\uBB34\uC2DC):",c.message)}return J({ok:!0},200,f)}async function ne(r,i,t,f){return K(i,t)?await t.DB.prepare("SELECT id FROM ott_contents WHERE id = ?").bind(r).first()?(await t.DB.prepare("DELETE FROM ott_contents WHERE id = ?").bind(r).run(),J({ok:!0},200,f)):J({ok:!1,error:"\uC601\uC0C1\uC744 \uCC3E\uC744 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4."},404,f):J({ok:!1,error:"\uAD8C\uD55C\uC774 \uC5C6\uC2B5\uB2C8\uB2E4."},403,f)}async function oe(r,i,t){if(!K(r,i))return J({ok:!1,error:"\uAD8C\uD55C\uC774 \uC5C6\uC2B5\uB2C8\uB2E4."},403,t);let f;try{f=await r.json()}catch{return J({ok:!1,error:"\uC798\uBABB\uB41C \uC694\uCCAD \uD615\uC2DD\uC785\uB2C8\uB2E4."},400,t)}let{ordered_ids:e}=f;if(!Array.isArray(e)||e.length===0)return J({ok:!1,error:"ordered_ids \uBC30\uC5F4\uC774 \uD544\uC694\uD569\uB2C8\uB2E4."},400,t);if(e.length>5)return J({ok:!1,error:"\uACE0\uC815 \uC601\uC0C1\uC740 \uCD5C\uB300 5\uAC1C\uC785\uB2C8\uB2E4."},400,t);let o=[i.DB.prepare("UPDATE ott_contents SET is_pinned = 0, sort_order = 0"),...e.map((n,p)=>i.DB.prepare("UPDATE ott_contents SET is_pinned = 1, sort_order = ? WHERE id = ?").bind(p+1,n))];return await i.DB.batch(o),J({ok:!0},200,t)}var Ot="https://api.anthropic.com/v1/messages",kt="https://ottrank.kr",G={netflix:"\uB137\uD50C\uB9AD\uC2A4",tving:"\uD2F0\uBE59",wavve:"\uC6E8\uC774\uBE0C",disney:"\uB514\uC988\uB2C8+",coupang:"\uCFE0\uD321\uD50C\uB808\uC774",boxoffice:"\uBC15\uC2A4\uC624\uD53C\uC2A4"},yt={friendly:`\uB124\uC774\uBC84 \uBE14\uB85C\uADF8 \uAC10\uC131 \uB9D0\uD22C. \uC9E7\uC740 \uC904\uBC14\uAFC8, \uBCF8\uC778 \uC598\uAE30\uB85C \uC2DC\uC791, \uB3C5\uC790\uC5D0\uAC8C \uB9D0 \uAC70\uB294 \uB290\uB08C.
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
- "\uC5B4\uB5A4 \uB4DC\uB77C\uB9C8\uB294 \uB05D\uB098\uACE0 \uB098\uC11C\uB3C4 \uD55C\uCC38\uC744 \uBA38\uB9BF\uC18D\uC5D0 \uB0A8\uC544\uC694. \uC774\uAC8C \uADF8\uB7F0 \uC791\uD488\uC785\uB2C8\uB2E4"`},Rt={weekly_ranking:"\uC8FC\uAC04 TOP10 \uB7AD\uD0B9 \uD3EC\uC2A4\uD305\uC744 \uC791\uC131\uD574\uC8FC\uC138\uC694. \uC21C\uC704\uC640 \uD568\uAED8 \uAC01 \uC791\uD488\uC744 \uC18C\uAC1C\uD558\uACE0, \uC774\uBC88 \uC8FC \uD2B9\uD788 \uC8FC\uBAA9\uD560 \uC791\uD488\uC744 \uAC15\uC870\uD574\uC8FC\uC138\uC694.",recommendation:"\uC9C0\uAE08 \uB2F9\uC7A5 \uBD10\uC57C \uD560 \uCD94\uCC9C \uC791\uD488 \uBAA8\uC74C \uD3EC\uC2A4\uD305\uC744 \uC791\uC131\uD574\uC8FC\uC138\uC694. \uAC01 \uC791\uD488\uC758 \uB9E4\uB825 \uD3EC\uC778\uD2B8\uC640 \uCD94\uCC9C \uC774\uC720\uB97C \uAD6C\uCCB4\uC801\uC73C\uB85C \uAC15\uC870\uD574\uC8FC\uC138\uC694.",genre:"\uC7A5\uB974\uBCC4\uB85C \uC791\uD488\uC744 \uBD84\uB958\uD558\uACE0, \uC5B4\uB5A4 \uCDE8\uD5A5\uC758 \uC0AC\uB78C\uC5D0\uAC8C \uC5B4\uC6B8\uB9AC\uB294\uC9C0 \uC124\uBA85\uC744 \uD3EC\uD568\uD55C \uCD94\uCC9C \uD3EC\uC2A4\uD305\uC744 \uC791\uC131\uD574\uC8FC\uC138\uC694.",review:"\uC0C1\uC704 3~5\uAC1C \uC791\uD488\uC5D0 \uC9D1\uC911\uD574\uC11C \uC904\uAC70\uB9AC, \uBCFC\uAC70\uB9AC, \uCD94\uCC9C \uD3EC\uC778\uD2B8\uB97C \uB2F4\uC740 \uBBF8\uB2C8 \uB9AC\uBDF0 \uD615\uD0DC\uC758 \uD3EC\uC2A4\uD305\uC744 \uC791\uC131\uD574\uC8FC\uC138\uC694."},St={ranking:{label:"\uC21C\uC704\uD615",examples:["{platform} {media} \uC21C\uC704 TOP 10 ({week} \uC5C5\uB370\uC774\uD2B8)","\uC694\uC998 {platform} \uC21C\uC704 {media} TOP 10 \uACE8\uB77C\uBD04","{week} {platform} \uC21C\uC704 {media} \uC815\uB9AC","{platform} \uC624\uB298 \uC21C\uC704 TOP 10 {media} (\uCD5C\uC2E0)"],rule:`1. "{platform} + \uC21C\uC704 + TOP N \uB610\uB294 \uB0A0\uC9DC" \uC870\uD569 \uD544\uC218
2. \uC2E4\uC81C \uB7AD\uD0B9 1~3\uC704 \uC791\uD488\uBA85\uC744 \uC81C\uBAA9\uC5D0 \uC9C1\uC811 \uD65C\uC6A9 (\uAC80\uC0C9\uB7C9 \uADF9\uB300\uD654)
3. \uB0A0\uC9DC/\uC8FC\uCC28 \uD45C\uAE30\uB85C \uCD5C\uC2E0\uC131 \uAC15\uC870 (\uC608: {week}, 2026 \uCD5C\uC2E0)`},recommendation:{label:"\uCD94\uCC9C\uD615",examples:["\uC9C0\uAE08 \uB2F9\uC7A5 \uBD10\uC57C \uD560 {platform} \uCD94\uCC9C {media} BEST 5","{platform} \uBCFC\uB9CC\uD55C\uAC70 \uC5C6\uC744 \uB54C \uCD94\uCC9C {media} TOP 7","\uC694\uC998 \uD56B\uD55C {platform} {media} \uCD94\uCC9C 2026 \uCD5C\uC2E0\uD310","{platform} {media} \uCD94\uCC9C \uC7A5\uB974\uBCC4 \uBAA8\uC74C (\uB85C\uB9E8\uC2A4\xB7\uC2A4\uB9B4\uB7EC\xB7\uBC94\uC8C4)"],rule:`1. "\uC9C0\uAE08 \uBD10\uC57C \uD560", "\uCD94\uCC9C", "BEST", "\uAC15\uCD94" \uB4F1 \uD050\uB808\uC774\uC158 \uD0A4\uC6CC\uB4DC \uD544\uC218
2. TOP N \uC22B\uC790\uB294 \uC120\uD0DD\uC801\uC73C\uB85C\uB9CC \uC0AC\uC6A9 \u2014 \uC21C\uC704 \uB098\uC5F4\uD615 \uC81C\uBAA9\uC73C\uB85C \uD750\uB974\uC9C0 \uB9D0 \uAC83
3. \uC7A5\uB974\xB7\uCDE8\uD5A5 \uAE30\uBC18 \uD45C\uD604\uC744 \uC801\uADF9 \uD65C\uC6A9`},review:{label:"\uB9AC\uBDF0\uD615",examples:["{platform} 1\uC704 [\uC791\uD488\uBA85] \uC194\uC9C1 \uD6C4\uAE30 \uC7AC\uBC0C\uC5B4? \uACB0\uB9D0\uAE4C\uC9C0","[\uC791\uD488\uBA85] {platform} {media} \uC644\uC8FC \uD6C4\uAE30 (\uC2A4\uD3EC\uC5C6\uC74C)","{platform} [\uC791\uD488\uBA85] \uC815\uC8FC\uD589 \uC644\uB8CC \uBCC4\uC810 \uBA87 \uC810?"],rule:`1. \uB7AD\uD0B9 1\uC704 \uC791\uD488 \uD558\uB098\uC5D0 \uC9D1\uC911\uD55C \uB2E8\uC77C \uC791\uD488 \uB9AC\uBDF0 \uC81C\uBAA9
2. "\uD6C4\uAE30", "\uC194\uC9C1 \uB9AC\uBDF0", "\uACB0\uB9D0", "\uC815\uC8FC\uD589" \uB4F1 \uAC10\uC0C1 \uD0A4\uC6CC\uB4DC \uD544\uC218
3. TOP N \uC21C\uC704 \uB098\uC5F4\uD615 \uC81C\uBAA9\uC740 \uC808\uB300 \uC0AC\uC6A9\uD558\uC9C0 \uB9D0 \uAC83`},issue:{label:"\uD654\uC81C\uD615",examples:["{platform} {media} \uD654\uC81C\uC791 \uC774\uBC88 \uC8FC \uB193\uCE58\uBA74 \uD6C4\uD68C TOP 5","2026 \uC0C1\uBC18\uAE30 {platform} {media} \uD765\uD589 \uC21C\uC704 \uC815\uB9AC","{platform} [\uC791\uD488\uBA85] \uC2DC\uC98C2 \uAE30\uB300\uB418\uB294 \uC774\uC720"],rule:`1. "\uD654\uC81C", "\uC774\uC288", "\uD765\uD589", "\uB17C\uB780", "\uC2DC\uC98C2 \uAE30\uB300" \uB4F1 \uD654\uC81C\uC131 \uD0A4\uC6CC\uB4DC \uD544\uC218
2. \uB2E8\uC21C \uC21C\uC704 \uB098\uC5F4\uD615(TOP N) \uC81C\uBAA9\uC740 \uC9C0\uC591\uD558\uACE0 \uD654\uC81C\uC131\uC5D0 \uC9D1\uC911`}};async function st(r,i,t=null){let f=t?`SELECT category_slot, display_name, platform_limit, source_name
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
       ORDER BY platform_order ASC`,e=t?await i.DB.prepare(f).bind(r,t).all():await i.DB.prepare(f).bind(r).all();if(!e.results||e.results.length===0)return[];let o=[];for(let n of e.results){let p=n.platform_limit||10,_=await i.DB.prepare(`SELECT
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
       LIMIT ?`).bind(r,n.category_slot,r,n.category_slot,p).all();_.results&&_.results.length>0&&o.push({category_slot:n.category_slot,display_name:n.display_name,source_name:n.source_name||"",items:_.results})}return o}function de(r,i){let f=`[${G[i]||i} \uD604\uC7AC \uB7AD\uD0B9 \uB370\uC774\uD130]

`;return r.forEach(e=>{!e.items||e.items.length===0||(f+=`## ${e.display_name}
`,e.items.forEach((o,n)=>{let p=o.title_ko||o.title_en||"\uC81C\uBAA9 \uC5C6\uC74C",_=o.tmdb_rating?` (\uC624\uB728\uB791 \uD3C9\uC810: ${o.tmdb_rating})`:"",c=o.release_year?` [${o.release_year}\uB144]`:"",s=o.genre?` | \uC7A5\uB974: ${o.genre}`:"";f+=`${n+1}\uC704. ${p}${c}${_}${s}
`}),f+=`
`)}),f}function bt(){let r=new Date,i=r.getFullYear(),t=r.getMonth()+1,f=Math.ceil(r.getDate()/7);return`${i}\uB144 ${t}\uC6D4 ${f}\uC8FC\uCC28`}async function le(r,i,{useWebSearch:t=!0,maxTokens:f=4096}={}){let e={model:"claude-sonnet-4-6",max_tokens:f,messages:[{role:"user",content:r}]};t&&(e.tools=[{type:"web_search_20250305",name:"web_search",max_uses:5}]);let o=await fetch(Ot,{method:"POST",headers:{"Content-Type":"application/json","x-api-key":i,"anthropic-version":"2023-06-01"},body:JSON.stringify(e)});if(!o.ok){let p=await o.json().catch(()=>({}));throw new Error(p.error?.message||`Anthropic API \uC624\uB958: ${o.status}`)}return((await o.json()).content||[]).filter(p=>p.type==="text").map(p=>p.text).join(`
`)}async function Nt(r,i,t,f,e){if(i.method==="GET"&&r==="/blog-gen/image"){let o=f.searchParams.get("path")||"",n=f.searchParams.get("size")||"w780";if(!o)return new Response(JSON.stringify({ok:!1,error:"path \uD30C\uB77C\uBBF8\uD130 \uD544\uC694"}),{status:400,headers:e});try{let p=`https://image.tmdb.org/t/p/${n}${o}`,_=await fetch(p);if(!_.ok)throw new Error(`\uC774\uBBF8\uC9C0 \uB85C\uB4DC \uC2E4\uD328: ${_.status}`);let c=await _.arrayBuffer(),s=_.headers.get("content-type")||"image/jpeg";return new Response(c,{status:200,headers:{"Content-Type":s,"Access-Control-Allow-Origin":e["Access-Control-Allow-Origin"],"Cache-Control":"public, max-age=86400"}})}catch(p){return new Response(JSON.stringify({ok:!1,error:p.message}),{status:500,headers:e})}}if(i.method==="GET"&&r==="/blog-gen/preview"){if(!D(i,t))return new Response(JSON.stringify({ok:!1,error:"Unauthorized"}),{status:401,headers:e});let o=f.searchParams.get("platform")||"netflix",n=f.searchParams.get("categorySlot")||null;if(!G[o])return new Response(JSON.stringify({ok:!1,error:"\uC9C0\uC6D0\uD558\uC9C0 \uC54A\uB294 \uD50C\uB7AB\uD3FC\uC785\uB2C8\uB2E4."}),{status:400,headers:e});try{let p=await st(o,t,n);return new Response(JSON.stringify({ok:!0,data:p}),{headers:e})}catch(p){return new Response(JSON.stringify({ok:!1,error:p.message}),{status:500,headers:e})}}if(i.method==="POST"&&r==="/blog-gen/suggest"){if(!D(i,t))return new Response(JSON.stringify({ok:!1,error:"Unauthorized"}),{status:401,headers:e});let o=t.ANTHROPIC_API_KEY;if(!o)return new Response(JSON.stringify({ok:!1,error:"ANTHROPIC_API_KEY \uD658\uACBD \uBCC0\uC218\uAC00 \uC124\uC815\uB418\uC9C0 \uC54A\uC558\uC2B5\uB2C8\uB2E4."}),{status:500,headers:e});let n;try{n=await i.json()}catch{return new Response(JSON.stringify({ok:!1,error:"\uC798\uBABB\uB41C \uC694\uCCAD \uD615\uC2DD\uC785\uB2C8\uB2E4."}),{status:400,headers:e})}let{platform:p="netflix",topicType:_="ranking",categorySlot:c="all"}=n;try{let s=[],a=p==="all"?["netflix","tving"]:[p],d=p!=="all"&&c&&c!=="all"?c:null;for(let N of a){if(N!=="all"&&!G[N])continue;let T=await st(N,t,d);s.push(...T)}let l="";s.length>0?l=s.map(N=>`[${N.display_name}]
`+(N.items||[]).slice(0,5).map((T,A)=>{let L=T.title_ko||T.title_en||"\uC81C\uBAA9 \uC5C6\uC74C",C=T.genre?` (${T.genre.split(",")[0]})`:"",I=T.tmdb_rating?` \u2605${parseFloat(T.tmdb_rating).toFixed(1)}`:"";return`  ${A+1}\uC704. ${L}${C}${I}`}).join(`
`)).join(`

`):l="\uD604\uC7AC \uB7AD\uD0B9 \uB370\uC774\uD130 \uC5C6\uC74C. OTT \uC778\uAE30 \uCF58\uD150\uCE20 \uC77C\uBC18 \uD2B8\uB80C\uB4DC \uAE30\uBC18\uC73C\uB85C \uCD94\uCC9C\uD574\uC8FC\uC138\uC694.";let m=p==="all"?"\uB137\uD50C\uB9AD\uC2A4\xB7\uD2F0\uBE59":G[p]||p,u=bt(),E=(()=>{if(s.length===1){let N=s[0].display_name||"";if(N.includes("\uC601\uD654"))return"\uC601\uD654";if(N.includes("\uB4DC\uB77C\uB9C8")||N.includes("TV")||N.includes("\uC2DC\uB9AC\uC988"))return"\uB4DC\uB77C\uB9C8"}return"\uB4DC\uB77C\uB9C8\xB7\uC601\uD654"})(),w=St[_]||St.ranking,g=w.examples.map(N=>"- "+N.replace(/{platform}/g,m).replace(/{media}/g,E).replace(/{week}/g,u)).join(`
`),y=w.rule.replace(/{platform}/g,m).replace(/{week}/g,u),k=`\uB2F9\uC2E0\uC740 \uB124\uC774\uBC84 \uBE14\uB85C\uADF8 SEO \uC804\uBB38\uAC00\uC785\uB2C8\uB2E4.
\uC544\uB798\uB294 \uB124\uC774\uBC84\uC5D0\uC11C \uC2E4\uC81C\uB85C \uC0C1\uC704 \uB178\uCD9C\uB418\uB294 OTT \uBE14\uB85C\uADF8 \uC81C\uBAA9 \uD328\uD134 \uC911 "${w.label}" \uC720\uD615 \uC608\uC2DC\uC785\uB2C8\uB2E4.
\uC774\uBC88 \uCD94\uCC9C\uC740 \uBC18\uB4DC\uC2DC "${w.label}" \uC2A4\uD0C0\uC77C\uB85C\uB9CC \uC791\uC131\uD558\uACE0, \uB2E4\uB978 \uC720\uD615\uACFC \uC11E\uC9C0 \uB9C8\uC138\uC694.

[${w.label} \uD328\uD134 \uC608\uC2DC]
${g}

\uD604\uC7AC \uB7AD\uD0B9 \uB370\uC774\uD130:
\uD50C\uB7AB\uD3FC: ${m} / \uAE30\uAC04: ${u}

${l}

\uC704 \uB370\uC774\uD130\uC5D0 \uC5C6\uB294 \uC8FC\uC81C(\uC608: \uB2E4\uC74C \uB2EC \uACF5\uAC1C \uC608\uC815 \uC2E0\uC791, \uC774\uBC88 \uBD84\uAE30\xB7\uBC18\uAE30 \uACB0\uC0B0, \uC544\uC9C1 \uB7AD\uD0B9\uC5D0 \uC548 \uC7A1\uD78C
\uCD5C\uC2E0 \uD654\uC81C\uC791\xB7\uC774\uC288 \uB4F1)\uB97C \uB2E4\uB904\uC57C \uD55C\uB2E4\uBA74, web_search\uB97C \uC5EC\uB7EC \uBC88 \uC0AC\uC6A9\uD574\uC11C \uC5B8\uB860 \uBCF4\uB3C4\xB7\uD654\uC81C\uC131\xB7
\uACF5\uAC1C \uC2DC\uAE30\xB7\uC2DC\uC98C \uAC31\uC2E0 \uC5EC\uBD80 \uAC19\uC740 \uB2E8\uC11C\uB4E4\uC744 \uCDA9\uBD84\uD788 \uBAA8\uC740 \uB4A4, \uADF8\uAC78 \uADFC\uAC70\uB85C \uC21C\uC704\xB7\uCD94\uCC9C \uB9AC\uC2A4\uD2B8\uB97C
\uB2F9\uB2F9\uD558\uAC8C \uB9CC\uB4E4\uC5B4\uB0B4\uC138\uC694. "\uC815\uD655\uD55C \uACF5\uC2DD \uC218\uCE58\uAC00 \uC5C6\uB2E4"\uB294 \uC2DD\uC73C\uB85C \uBC1C\uBE8C\uD558\uAC70\uB098 \uC560\uB9E4\uD558\uAC8C \uC5BC\uBC84\uBB34\uB9AC\uC9C0
\uB9D0\uACE0, \uC2E4\uC81C OTT \uBE14\uB85C\uAC70\uAC00 \uC4F0\uB4EF \uC790\uC5F0\uC2A4\uB7FD\uAC8C \uB2E8\uC815\uD574\uC11C \uC4F0\uC138\uC694. \uB2E8, \uAC80\uC0C9 \uACB0\uACFC \uBB38\uC7A5\uC744 \uADF8\uB300\uB85C
\uBCA0\uB07C\uC9C0 \uB9D0\uACE0 \uC9C1\uC811 \uC0C8\uB85C \uD45C\uD604\uD574\uC57C \uD569\uB2C8\uB2E4.

\uC81C\uBAA9 \uC0DD\uC131 \uC870\uAC74:
${y}
4. 15~35\uC790 \uD55C\uAD6D\uC5B4, \uD2B9\uC218\uAE30\uD638 \uCD5C\uC18C\uD654
5. 8\uAC1C \uBAA8\uB450 \uC704 "${w.label}" \uD328\uD134 \uC2A4\uD0C0\uC77C\uC744 \uC720\uC9C0\uD558\uB418 \uD45C\uD604\uC740 \uB2E4\uC591\uD558\uAC8C \uBCC0\uC8FC
6. contentType: weekly_ranking / recommendation / genre / review \uC911 \uC120\uD0DD

\uB2E4\uB978 \uC124\uBA85, \uAC80\uC0C9 \uACFC\uC815 \uC124\uBA85, \uCD9C\uCC98 \uD45C\uAE30 \uC5C6\uC774 \uC544\uB798 JSON \uBC30\uC5F4 \uD615\uC2DD\uC73C\uB85C\uB9CC \uC751\uB2F5\uD558\uC138\uC694.
\uB9C8\uD06C\uB2E4\uC6B4 \uCF54\uB4DC\uBE14\uB85D(\`\`\`) \uC5C6\uC774 \uC21C\uC218 JSON\uB9CC \uBC18\uD658\uD569\uB2C8\uB2E4:
[
  {
    "title": "\uBE14\uB85C\uADF8 \uC81C\uBAA9",
    "topic": "\uD55C \uC904 \uC8FC\uC81C \uC124\uBA85 (20\uC790 \uC774\uB0B4)",
    "contentType": "weekly_ranking"
  }
]`,O=await fetch(Ot,{method:"POST",headers:{"Content-Type":"application/json","x-api-key":o,"anthropic-version":"2023-06-01"},body:JSON.stringify({model:"claude-haiku-4-5-20251001",max_tokens:1500,messages:[{role:"user",content:k}],tools:[{type:"web_search_20250305",name:"web_search",max_uses:3}]})});if(!O.ok){let N=await O.json().catch(()=>({}));throw new Error(N.error?.message||`Anthropic API \uC624\uB958: ${O.status}`)}let h=(((await O.json()).content||[]).filter(N=>N.type==="text").map(N=>N.text).join("").trim()||"[]").replace(/^```json\s*/i,"").replace(/^```\s*/,"").replace(/\s*```$/,"").trim(),b;try{b=JSON.parse(h)}catch{let N=h.match(/\[[\s\S]*\]/);if(N)try{b=JSON.parse(N[0])}catch{}}if(!b)throw new Error("AI \uC751\uB2F5\uC744 JSON\uC73C\uB85C \uD30C\uC2F1\uD560 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4. \uB2E4\uC2DC \uC2DC\uB3C4\uD574\uC8FC\uC138\uC694.");if(!Array.isArray(b))throw new Error("AI \uC751\uB2F5\uC774 \uBC30\uC5F4 \uD615\uC2DD\uC774 \uC544\uB2D9\uB2C8\uB2E4.");return b=b.filter(N=>N&&typeof N.title=="string"&&N.title.trim()).map(N=>({title:N.title.trim(),topic:N.topic?.trim()||"",contentType:N.contentType?.trim()||"weekly_ranking"})).slice(0,8),new Response(JSON.stringify({ok:!0,suggestions:b,rankingData:s,meta:{platform:m,weekLabel:u,topicType:_,categorySlot:d||"all",categoryLabel:d&&s.length===1?s[0].display_name:"\uC804\uCCB4",generatedAt:new Date().toISOString()}}),{headers:e})}catch(s){return new Response(JSON.stringify({ok:!1,error:s.message}),{status:500,headers:e})}}if(i.method==="POST"&&r==="/blog-gen"){if(!D(i,t))return new Response(JSON.stringify({ok:!1,error:"Unauthorized"}),{status:401,headers:e});let o=t.ANTHROPIC_API_KEY;if(!o)return new Response(JSON.stringify({ok:!1,error:"ANTHROPIC_API_KEY \uD658\uACBD \uBCC0\uC218\uAC00 \uC124\uC815\uB418\uC9C0 \uC54A\uC558\uC2B5\uB2C8\uB2E4. Cloudflare Workers \u2192 Settings \u2192 Variables and Secrets\uC5D0\uC11C \uB4F1\uB85D\uD574\uC8FC\uC138\uC694."}),{status:500,headers:e});let n;try{n=await i.json()}catch{return new Response(JSON.stringify({ok:!1,error:"\uC798\uBABB\uB41C \uC694\uCCAD \uD615\uC2DD\uC785\uB2C8\uB2E4."}),{status:400,headers:e})}let{platform:p="netflix",contentType:_="weekly_ranking",categorySlot:c="all",tone:s="friendly",useEmoji:a=!0,useRating:d=!0,useLink:l=!0,useSpoiler:m=!1,useHashtag:u=!0,extraRequest:E=""}=n;if(!G[p])return new Response(JSON.stringify({ok:!1,error:"\uC9C0\uC6D0\uD558\uC9C0 \uC54A\uB294 \uD50C\uB7AB\uD3FC\uC785\uB2C8\uB2E4."}),{status:400,headers:e});let w=c&&c!=="all"?c:null;try{let g=await st(p,t,w);if(g.length===0)return new Response(JSON.stringify({ok:!1,error:w?"\uC120\uD0DD\uD55C \uCE74\uD14C\uACE0\uB9AC\uC758 \uB7AD\uD0B9 \uB370\uC774\uD130\uAC00 \uC5C6\uC2B5\uB2C8\uB2E4. \uB2E4\uB978 \uCE74\uD14C\uACE0\uB9AC\uB97C \uC120\uD0DD\uD558\uAC70\uB098 '\uC804\uCCB4'\uB85C \uB2E4\uC2DC \uC2DC\uB3C4\uD574\uC8FC\uC138\uC694.":"\uB7AD\uD0B9 \uB370\uC774\uD130\uAC00 \uC5C6\uC2B5\uB2C8\uB2E4. \uD06C\uB864\uB9C1 \uC644\uB8CC \uD6C4 \uB2E4\uC2DC \uC2DC\uB3C4\uD558\uAC70\uB098, \uD398\uC774\uC9C0 \uCE74\uD14C\uACE0\uB9AC \uC124\uC815\uC5D0\uC11C OTT \uD398\uC774\uC9C0 \uB178\uCD9C \uC5EC\uBD80\uB97C \uD655\uC778\uD574\uC8FC\uC138\uC694."}),{status:404,headers:e});let y=de(g,p),k=bt(),O=G[p],R=g.length===1&&(g[0].display_name||"").includes("\uC601\uD654")?"\uC601\uD654":"\uB4DC\uB77C\uB9C8",S=!!(E&&E.trim()),h=S?E.trim():`${k} ${O} \u2014 ${Rt[_]||Rt.weekly_ranking}`,b=[];a||b.push("\uC774\uBAA8\uC9C0\uB97C \uC0AC\uC6A9\uD558\uC9C0 \uB9C8\uC138\uC694."),d&&b.push(`\uC624\uB728\uB791(${kt}) \uD3C9\uC810 \uC815\uBCF4\uB97C \uC790\uC5F0\uC2A4\uB7FD\uAC8C \uC5B8\uAE09\uD574\uC8FC\uC138\uC694.`),l&&b.push(`\uD3EC\uC2A4\uD305 \uC911\uAC04\uC774\uB098 \uB9C8\uC9C0\uB9C9\uC5D0 "${kt}" \uB9C1\uD06C\uB97C "\uC624\uB728\uB791\uC5D0\uC11C \uB354 \uBCF4\uAE30" \uD615\uD0DC\uB85C \uC790\uC5F0\uC2A4\uB7FD\uAC8C \uC0BD\uC785\uD574\uC8FC\uC138\uC694.`),m&&b.push("\uC2A4\uD3EC\uC77C\uB7EC \uC8FC\uC758 \uBB38\uAD6C\uAC00 \uD544\uC694\uD55C \uC791\uD488\uC5D0\uB294 \u26A0\uFE0F \uC2A4\uD3EC\uC8FC\uC758 \uB77C\uBCA8\uC744 \uB2EC\uC544\uC8FC\uC138\uC694."),u&&b.push(`\uD3EC\uC2A4\uD305 \uB9C8\uC9C0\uB9C9\uC5D0 \uB124\uC774\uBC84 \uBE14\uB85C\uADF8\uC6A9 \uD574\uC2DC\uD0DC\uADF8\uB97C 15\uAC1C \uC774\uC0C1 \uCD94\uAC00\uD574\uC8FC\uC138\uC694. (\uC608: #${O}${R}\uCD94\uCC9C #OTT\uCD94\uCC9C #${O}\uC21C\uC704 \uB4F1)`);let N=`\uB2F9\uC2E0\uC740 \uB124\uC774\uBC84 \uBE14\uB85C\uADF8\uC5D0 OTT \uCF58\uD150\uCE20 \uAE00\uC744 \uB9E4\uC77C \uC4F0\uB294 30\uB300 \uC9C1\uC7A5\uC778\uC785\uB2C8\uB2E4.
\uB4DC\uB77C\uB9C8\uB97C \uC9C4\uC9DC \uC88B\uC544\uD574\uC11C \uD1F4\uADFC \uD6C4\uC5D0 \uBCF4\uACE0, \uC8FC\uB9D0\uC5D0 \uBAB0\uC544\uBCF4\uACE0, \uB290\uB080 \uB300\uB85C \uC194\uC9C1\uD558\uAC8C \uC501\uB2C8\uB2E4.
${S?`\uC624\uB298 \uC4F8 \uAE00\uC758 \uC8FC\uC81C\uB294 \uC815\uD655\uD788 \uC774\uAC81\uB2C8\uB2E4: "${h}"
\uC774 \uC8FC\uC81C\uC5D0 \uB9DE\uAC8C \uAE00\uC744 \uC791\uC131\uD574\uC8FC\uC138\uC694. \uC544\uB798 \uB7AD\uD0B9 \uB370\uC774\uD130\uB294 \uCC38\uACE0\uC6A9 \uBCF4\uC870\uC790\uB8CC\uC77C \uBFD0\uC785\uB2C8\uB2E4 \u2014
\uC8FC\uC81C\uC640 \uC9C1\uC811 \uAD00\uB828\uB41C \uBD80\uBD84\uB9CC \uCC38\uACE0\uD558\uACE0, \uAD00\uB828 \uC5C6\uC73C\uBA74 \uBB34\uC2DC\uD558\uC138\uC694.`:"\uC544\uB798 \uB7AD\uD0B9 \uB370\uC774\uD130\uB97C \uBC14\uD0D5\uC73C\uB85C \uC9C0\uAE08 \uB2F9\uC7A5 \uC774 \uC0AC\uB78C\uC774 \uC4F8 \uAC83 \uAC19\uC740 \uBE14\uB85C\uADF8 \uAE00\uC744 \uC791\uC131\uD574\uC8FC\uC138\uC694."}

${y}

${S?`\uC8FC\uC81C("${h}")\uAC00 \uC704 \uB370\uC774\uD130\uB9CC\uC73C\uB85C\uB294 \uBD80\uC871\uD560 \uAC00\uB2A5\uC131\uC774 \uB192\uC2B5\uB2C8\uB2E4 \u2014 \uADF8\uB7F0 \uACBD\uC6B0
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
\uC8FC\uC81C: ${h}
\uB9D0\uD22C: ${yt[s]||yt.friendly}
\uAE38\uC774: 1500\uC790~2500\uC790
\uAD6C\uC870: [\uC81C\uBAA9] \u2192 \uB3C4\uC785\uBD80 \u2192 \uBCF8\uBB38 \u2192 \uB9C8\uBB34\uB9AC
${_==="weekly_ranking"?g.length>1?"\uC21C\uC704 \uB098\uC5F4: \uCE74\uD14C\uACE0\uB9AC\uBCC4\uB85C \uC139\uC158\uC744 \uB098\uB220\uC11C \uAC01\uAC01 10\uC704\u21921\uC704 \uC5ED\uC21C\uC73C\uB85C \uC791\uC131 (\uC11C\uB85C \uB2E4\uB978 \uCE74\uD14C\uACE0\uB9AC\uB97C \uD558\uB098\uC758 \uC21C\uC704 \uB9AC\uC2A4\uD2B8\uB85C \uD569\uCE58\uC9C0 \uB9D0 \uAC83)":"\uC21C\uC704 \uB098\uC5F4: 10\uC704\u21921\uC704 \uC5ED\uC21C (\uB05D\uAE4C\uC9C0 \uC77D\uAC8C \uC720\uB3C4)":""}

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

${b.length>0?`[\uCD94\uAC00 \uC9C0\uC2DC\uC0AC\uD56D]
`+b.map((A,L)=>`${L+1}. ${A}`).join(`
`):""}

\uB9C8\uD06C\uB2E4\uC6B4 \uAE30\uD638 \uC5C6\uC774 \uC77C\uBC18 \uD14D\uC2A4\uD2B8\uB85C, \uB2E8\uB77D \uAD6C\uBD84\uC740 \uBE48 \uC904\uB85C\uB9CC \uD574\uC8FC\uC138\uC694.`,T=await le(N,o,{useWebSearch:S,maxTokens:S?5e3:4096});if(!T)throw new Error("AI \uC751\uB2F5\uC774 \uBE44\uC5B4\uC788\uC2B5\uB2C8\uB2E4. \uB2E4\uC2DC \uC2DC\uB3C4\uD574\uC8FC\uC138\uC694.");return new Response(JSON.stringify({ok:!0,post:T,rankingData:g,meta:{platform:p,platformName:O,weekInfo:k,categorySlot:w||"all",categoryLabel:w&&g.length===1?g[0].display_name:"\uC804\uCCB4",generatedAt:new Date().toISOString()}}),{headers:e})}catch(g){return new Response(JSON.stringify({ok:!1,error:g.message}),{status:500,headers:e})}}return null}var ce=["ad","bug"],_e=["pending","answered","resolved"],pe=5,Tt=30;async function ht(r,i,t,f,e,o){if(r==="/inquiry"&&i.method==="POST")try{let _=await i.json(),{type:c,name:s,email:a,phone:d,title:l,content:m,page_url:u,website:E}=_;if(E)return new Response(JSON.stringify({ok:!0}),{headers:o});if(!ce.includes(c))return new Response(JSON.stringify({ok:!1,message:"type\uC740 ad \uB610\uB294 bug\uC5EC\uC57C \uD569\uB2C8\uB2E4"}),{status:400,headers:o});if(!l||!l.trim()||!m||!m.trim())return new Response(JSON.stringify({ok:!1,message:"\uC81C\uBAA9\uACFC \uB0B4\uC6A9\uC740 \uD544\uC218\uC785\uB2C8\uB2E4"}),{status:400,headers:o});if(c==="ad"){if(!s||!s.trim())return new Response(JSON.stringify({ok:!1,message:"\uB2F4\uB2F9\uC790\uBA85 \uB610\uB294 \uC5C5\uCCB4\uBA85\uC744 \uC785\uB825\uD574\uC8FC\uC138\uC694"}),{status:400,headers:o});if(!a||!a.trim())return new Response(JSON.stringify({ok:!1,message:"\uC774\uBA54\uC77C\uC744 \uC785\uB825\uD574\uC8FC\uC138\uC694"}),{status:400,headers:o})}if(a&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(a))return new Response(JSON.stringify({ok:!1,message:"\uC774\uBA54\uC77C \uD615\uC2DD\uC774 \uC62C\uBC14\uB974\uC9C0 \uC54A\uC2B5\uB2C8\uB2E4"}),{status:400,headers:o});let w=c,g=String(l).slice(0,200),y=String(m).slice(0,5e3),k=s?String(s).slice(0,100):null,O=a?String(a).slice(0,200):null,R=d?String(d).slice(0,30):null,S=u?String(u).slice(0,500):null,h=i.headers.get("User-Agent")||null,b=i.headers.get("CF-Connecting-IP")||null,N=null;try{let T=i.headers.get("Authorization")||"",L=(T.startsWith("Bearer ")?T.slice(7).trim():null)||B(i);if(L){let C=await t.DB.prepare("SELECT user_id AS id FROM sessions WHERE id = ? LIMIT 1").bind(L).first();C&&(N=C.id)}}catch{}return b&&((await t.DB.prepare(`SELECT COUNT(*) as cnt FROM inquiries
           WHERE ip_address = ? AND created_at > datetime('now', '-1 hour')`).bind(b).first())?.cnt||0)>=pe&&await t.DB.prepare(`SELECT id FROM inquiries
             WHERE ip_address = ? AND created_at > datetime('now', '-${Tt} seconds')
             LIMIT 1`).bind(b).first()?new Response(JSON.stringify({ok:!1,message:`\uC9E7\uC740 \uC2DC\uAC04\uC5D0 \uB108\uBB34 \uB9CE\uC774 \uC81C\uCD9C\uB410\uC5B4\uC694. ${Tt}\uCD08 \uD6C4 \uB2E4\uC2DC \uC2DC\uB3C4\uD574\uC8FC\uC138\uC694.`}),{status:429,headers:o}):(await t.DB.prepare(`
        INSERT INTO inquiries (
          type, name, email, phone, title, content, page_url,
          user_agent, ip_address, user_id, status, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', datetime('now'), datetime('now'))
      `).bind(w,k,O,R,g,y,S,h,b,N).run(),new Response(JSON.stringify({ok:!0}),{headers:o}))}catch(_){return new Response(JSON.stringify({ok:!1,message:_.message}),{status:500,headers:o})}let n=r.match(/^\/admin\/inquiry\/(\d+)$/);if(i.method==="DELETE"&&n){if(i.headers.get("Authorization")!==`Bearer ${t.ADMIN_SECRET}`)return new Response(JSON.stringify({ok:!1,message:"Unauthorized"}),{status:401,headers:o});try{return await t.DB.prepare("DELETE FROM inquiries WHERE id = ?").bind(n[1]).run(),new Response(JSON.stringify({ok:!0}),{headers:o})}catch(_){return new Response(JSON.stringify({ok:!1,message:_.message}),{status:500,headers:o})}}let p=r.match(/^\/admin\/inquiry\/(\d+)$/);if(i.method==="PATCH"&&p){if(i.headers.get("Authorization")!==`Bearer ${t.ADMIN_SECRET}`)return new Response(JSON.stringify({ok:!1,message:"Unauthorized"}),{status:401,headers:o});try{let _=await i.json(),{status:c,admin_reply:s}=_;return c&&!_e.includes(c)?new Response(JSON.stringify({ok:!1,message:"status \uAC12\uC774 \uC62C\uBC14\uB974\uC9C0 \uC54A\uC2B5\uB2C8\uB2E4"}),{status:400,headers:o}):await t.DB.prepare("SELECT id FROM inquiries WHERE id = ?").bind(p[1]).first()?(await t.DB.prepare(`
        UPDATE inquiries
        SET status      = COALESCE(?, status),
            admin_reply = COALESCE(?, admin_reply),
            updated_at  = datetime('now')
        WHERE id = ?
      `).bind(c||null,s??null,p[1]).run(),new Response(JSON.stringify({ok:!0}),{headers:o})):new Response(JSON.stringify({ok:!1,message:"\uCC3E\uC744 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4"}),{status:404,headers:o})}catch(_){return new Response(JSON.stringify({ok:!1,message:_.message}),{status:500,headers:o})}}if(r==="/admin/inquiry"&&i.method==="GET"){if(i.headers.get("Authorization")!==`Bearer ${t.ADMIN_SECRET}`)return new Response(JSON.stringify({ok:!1,message:"Unauthorized"}),{status:401,headers:o});try{let _=e.searchParams.get("type")||"all",c=e.searchParams.get("status")||"all",s=Math.min(parseInt(e.searchParams.get("limit")||"50"),100),a=Math.max(parseInt(e.searchParams.get("offset")||"0"),0),d=[],l=[];_!=="all"&&(d.push("type = ?"),l.push(_)),c!=="all"&&(d.push("status = ?"),l.push(c));let m=d.length?`WHERE ${d.join(" AND ")}`:"",[u,E]=await t.DB.batch([t.DB.prepare(`SELECT * FROM inquiries ${m} ORDER BY created_at DESC LIMIT ? OFFSET ?`).bind(...l,s,a),t.DB.prepare(`SELECT COUNT(*) as cnt FROM inquiries ${m}`).bind(...l)]),w=u.results||[],g=E.results?.[0]?.cnt||0;return new Response(JSON.stringify({ok:!0,data:w,total:g}),{headers:o})}catch(_){return new Response(JSON.stringify({ok:!1,message:_.message}),{status:500,headers:o})}}return null}var me=new Set(["w92","w154","w185","w300","w342","w500","w780","w1280","original"]),ue=1200*60*60,fe="tmdb-cache/";async function Dt(r,i,t,f){let e=r.match(/^\/tmdb-img\/([^/]+)\/(.+)$/);if(!e)return new Response("Not found",{status:404});let[,o,n]=e;if(!me.has(o))return new Response("Invalid size",{status:400});let p=`${fe}${o}/${n}`,_=caches.default,c=new Request(i.url,i),s=await _.match(c);if(s)return s;let a=null;try{a=await fetch(`https://image.tmdb.org/t/p/${o}/${n}`)}catch{a=null}if(a&&a.ok){let l=await a.arrayBuffer(),m=a.headers.get("Content-Type")||"image/jpeg",u=new Response(l,{status:200,headers:{"Content-Type":m,"Cache-Control":`public, max-age=${ue}, immutable`,"Access-Control-Allow-Origin":"*"}});return f.waitUntil(_.put(c,u.clone())),f.waitUntil(t.IMAGES.put(p,l,{httpMetadata:{contentType:m}})),u}let d=await t.IMAGES.get(p);return d?new Response(d.body,{status:200,headers:{"Content-Type":d.httpMetadata?.contentType||"image/jpeg","Cache-Control":"public, max-age=3600","Access-Control-Allow-Origin":"*"}}):new Response("Image unavailable",{status:502})}async function Lt(r,i,t,f,e){try{let o=r.split("/").filter(Boolean),n=o[o.length-1],p=parseInt(n,10);if(!Number.isInteger(p)||p<=0)return new Response(JSON.stringify({ok:!1,error:"invalid tmdb_person_id"}),{status:400,headers:e});let c=await t.DB.prepare(`SELECT tmdb_person_id, wiki_title, bio_summary, career_history,
              debut_work, debut_year, education, awards_text,
              kmdb_id, imdb_id, source_url, hidden_fields
       FROM person_wiki_cache
       WHERE tmdb_person_id = ?`).bind(p).first()||null;if(c){c={...c};let d=(c.hidden_fields||"").split(",").map(l=>l.trim()).filter(Boolean);delete c.hidden_fields,d.includes("bio_summary")&&(c.bio_summary=null),d.includes("career_history")&&(c.career_history=null),d.includes("awards_text")&&(c.awards_text=null),d.includes("debut_work")&&(c.debut_work=null,c.debut_year=null),d.includes("education")&&(c.education=null),d.includes("kmdb_id")&&(c.kmdb_id=null),d.includes("imdb_id")&&(c.imdb_id=null)}let s=await t.DB.prepare("SELECT birthday, gender, place_of_birth FROM persons WHERE tmdb_id = ?").bind(p).first(),a=null;if(s){let d=s.birthday&&s.birthday!=="",l=!!s.gender,m=s.place_of_birth&&s.place_of_birth!=="";(d||l||m)&&(a={birthday:d?s.birthday:null,gender:l?s.gender:null,place_of_birth:m?s.place_of_birth:null})}return new Response(JSON.stringify({ok:!0,data:c,manual:a}),{status:200,headers:e})}catch(o){return console.log("[person-wiki] error:",o.message),new Response(JSON.stringify({ok:!1,error:"internal error"}),{status:500,headers:e})}}async function ge(r,i,t){let f=i?[i]:["tv","movie"],e=!1;for(let o of f)try{let n=await fetch(`https://api.themoviedb.org/3/${o}/${r}/images?api_key=${t.TMDB_API_KEY}`);if(!n.ok)continue;e=!0;let _=(await n.json()).logos||[],c=_.find(s=>s.iso_639_1==="ko")||_.find(s=>!s.iso_639_1)||null;if(c)return{ok:!0,logoPath:c.file_path}}catch{}return{ok:e,logoPath:null}}async function It(r,i){let{results:t}=await r.DB.prepare(`SELECT w.tmdb_id, w.media_type
     FROM hot100_scores h
     JOIN works w ON w.tmdb_id = h.tmdb_id
     WHERE COALESCE(w.hero_title_baked_in, 0) = 0
       AND w.hero_logo_checked_at IS NULL
     LIMIT ?`).bind(i).all();if(!t||t.length===0)return{processed:0,found:0,failed:0};let f=new Date(Date.now()+540*60*1e3).toISOString().slice(0,19).replace("T"," "),e=0,o=0,n=[];for(let p of t){let _=await ge(p.tmdb_id,p.media_type||null,r);if(!_.ok){o++;continue}_.logoPath&&e++,n.push(r.DB.prepare("UPDATE works SET hero_logo_path = ?, hero_logo_checked_at = ? WHERE tmdb_id = ?").bind(_.logoPath,f,p.tmdb_id))}return n.length>0&&await r.DB.batch(n),{processed:n.length,found:e,failed:o}}async function At(r,i,t){if(!await D(r,i))return new Response(JSON.stringify({ok:!1,error:"\uAD00\uB9AC\uC790 \uC778\uC99D\uC774 \uD544\uC694\uD569\uB2C8\uB2E4."}),{status:401,headers:t});try{let e=await i.DB.prepare("SELECT value AS latest_date FROM app_settings WHERE key = 'latest_ranking_date'").first();if(!e||!e.latest_date)return new Response(JSON.stringify({ok:!1,error:"rankings \uD14C\uC774\uBE14\uC5D0 \uC720\uD6A8\uD55C \uD06C\uB864\uB9C1 \uB370\uC774\uD130\uAC00 \uC5C6\uC2B5\uB2C8\uB2E4."}),{status:404,headers:t});let o=e.latest_date,n=`
      WITH latest_per_slot AS (
        SELECT platform, category_slot, MAX(date) AS latest_date
        FROM rankings
        WHERE date < 'manual'
        GROUP BY platform, category_slot
      ),
      target_rankings AS (
        SELECT r.tmdb_id, r.platform, r.rank, r.title_ko,
               COALESCE(oc.hot100_weight, 0.5) AS category_weight
        FROM rankings r
        JOIN ott_categories oc
          ON oc.platform = r.platform
         AND oc.category_slot = r.category_slot
        JOIN latest_per_slot lps
          ON lps.platform = r.platform
         AND lps.category_slot = r.category_slot
         AND r.date = lps.latest_date
        WHERE r.tmdb_id IS NOT NULL
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
    `,{results:p}=await i.DB.prepare(n).all(),{results:_}=await i.DB.prepare("SELECT tmdb_id, boost_value, is_pinned, pinned_score, pinned_platform FROM admin_boosts").all(),c=new Map((_||[]).map(w=>[w.tmdb_id,w]));if((!p||p.length===0)&&c.size===0)return new Response(JSON.stringify({ok:!1,error:"\uACC4\uC0B0\uD560 \uB7AD\uD0B9 \uB370\uC774\uD130\uAC00 \uC5C6\uC2B5\uB2C8\uB2E4."}),{status:404,headers:t});let s=[],a=new Set;for(let w of p||[]){a.add(w.tmdb_id);let g=c.get(w.tmdb_id);g&&g.is_pinned?s.push({tmdb_id:w.tmdb_id,best_platform:g.pinned_platform||w.best_platform,best_rank:w.best_rank,rank_score:0,platform_weight:0,weighted_score:0,admin_boost:g.pinned_score??0}):s.push(w)}for(let[w,g]of c)a.has(w)||(g.is_pinned?s.push({tmdb_id:w,best_platform:g.pinned_platform||"manual",best_rank:null,rank_score:0,platform_weight:0,weighted_score:0,admin_boost:g.pinned_score??0}):g.boost_value&&s.push({tmdb_id:w,best_platform:g.pinned_platform||"manual",best_rank:null,rank_score:0,platform_weight:0,weighted_score:0,admin_boost:g.boost_value}));s.sort((w,g)=>g.weighted_score+g.admin_boost-(w.weighted_score+w.admin_boost));let d=new Date(Date.now()+540*60*1e3).toISOString().slice(0,19).replace("T"," "),l=[i.DB.prepare("DELETE FROM hot100_scores")];for(let w of s){let g=w.weighted_score+w.admin_boost;l.push(i.DB.prepare(`INSERT INTO hot100_scores
            (tmdb_id, calc_date, best_platform, platform_weight,
             rank_score, weighted_rank_score, engagement_score,
             admin_boost, total_score, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?, ?)`).bind(w.tmdb_id,o,w.best_platform,w.platform_weight,w.rank_score,w.weighted_score,w.admin_boost,g,d))}await i.DB.batch(l);let m=s.filter(w=>w.best_platform==="netflix").slice(0,20),u=0;if(m.length>0){let w=m.map(R=>R.tmdb_id),g=w.map(()=>"?").join(","),{results:y}=await i.DB.prepare(`SELECT tmdb_id, title_ko, title_en, poster_path, genre, tmdb_rating, release_year
         FROM works WHERE tmdb_id IN (${g})`).bind(...w).all(),k=new Map((y||[]).map(R=>[R.tmdb_id,R])),O=[i.DB.prepare("DELETE FROM rankings WHERE platform = 'netflix' AND category_slot = 'category10' AND date = ?").bind(o)];m.forEach((R,S)=>{let h=k.get(R.tmdb_id)||{};O.push(i.DB.prepare(`INSERT INTO rankings
              (platform, category_slot, category, date, rank, tmdb_id,
               title_ko, title_en, poster_path, release_year, genre, tmdb_rating,
               is_manual, source_name)
             VALUES ('netflix', 'category10', 'category10', ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 'HOT100 \uAE30\uBC18 \uD1B5\uD569\uB7AD\uD0B9')`).bind(o,S+1,R.tmdb_id,h.title_ko||"",h.title_en||"",h.poster_path||null,h.release_year||null,h.genre||null,h.tmdb_rating||null))}),await i.DB.batch(O),u=m.length}let E={processed:0,found:0,failed:0};try{E=await It(i,20)}catch(w){console.error("calcHot100 \uB85C\uACE0 \uBC31\uD544 \uC624\uB958:",w)}return new Response(JSON.stringify({ok:!0,netflix_overall_saved:u,calc_date:o,total_works:s.length,hero_logo_backfill:E,top10_preview:s.slice(0,10).map(w=>({tmdb_id:w.tmdb_id,best_platform:w.best_platform,best_rank:w.best_rank,total_score:w.weighted_score+w.admin_boost}))}),{status:200,headers:t})}catch(e){return console.error("calcHot100 \uC624\uB958:",e),new Response(JSON.stringify({ok:!1,error:"HOT100 \uACC4\uC0B0 \uC911 \uC624\uB958\uAC00 \uBC1C\uC0DD\uD588\uC2B5\uB2C8\uB2E4.",detail:e.message}),{status:500,headers:t})}}async function Ct(r,i,t){if(!await D(r,i))return new Response(JSON.stringify({ok:!1,error:"\uAD00\uB9AC\uC790 \uC778\uC99D\uC774 \uD544\uC694\uD569\uB2C8\uB2E4."}),{status:401,headers:t});try{let{results:e}=await i.DB.prepare(`SELECT ab.tmdb_id, ab.boost_value, ab.reason, ab.is_pinned, ab.pinned_score, ab.pinned_platform, ab.updated_at,
              w.title_ko, w.poster_path
       FROM admin_boosts ab
       LEFT JOIN works w ON w.tmdb_id = ab.tmdb_id
       ORDER BY ab.updated_at DESC`).all();return new Response(JSON.stringify({ok:!0,data:e||[]}),{status:200,headers:t})}catch(e){return new Response(JSON.stringify({ok:!1,error:e.message}),{status:500,headers:t})}}async function Bt(r,i,t){if(!await D(r,i))return new Response(JSON.stringify({ok:!1,error:"\uAD00\uB9AC\uC790 \uC778\uC99D\uC774 \uD544\uC694\uD569\uB2C8\uB2E4."}),{status:401,headers:t});try{let o=(new URL(r.url).searchParams.get("q")||"").trim();if(!o)return new Response(JSON.stringify({ok:!0,data:[]}),{status:200,headers:t});let{results:n}=await i.DB.prepare(`SELECT w.tmdb_id, w.title_ko, w.title_en, w.poster_path,
              COALESCE(ab.boost_value, 0) AS boost_value,
              COALESCE(ab.is_pinned, 0) AS is_pinned,
              ab.pinned_score,
              ab.pinned_platform
       FROM works w
       LEFT JOIN admin_boosts ab ON ab.tmdb_id = w.tmdb_id
       WHERE w.title_ko LIKE ? OR w.title_en LIKE ? OR w.tmdb_id = ?
       ORDER BY w.tmdb_id DESC
       LIMIT 20`).bind(`%${o}%`,`%${o}%`,parseInt(o,10)||0).all();return new Response(JSON.stringify({ok:!0,data:n||[]}),{status:200,headers:t})}catch(e){return new Response(JSON.stringify({ok:!1,error:e.message}),{status:500,headers:t})}}async function Jt(r,i,t){if(!await D(r,i))return new Response(JSON.stringify({ok:!1,error:"\uAD00\uB9AC\uC790 \uC778\uC99D\uC774 \uD544\uC694\uD569\uB2C8\uB2E4."}),{status:401,headers:t});try{let e=await r.json(),{tmdb_id:o,boost_value:n,reason:p,is_pinned:_,pinned_score:c,pinned_platform:s}=e;if(!o)return new Response(JSON.stringify({ok:!1,error:"tmdb_id\uAC00 \uD544\uC694\uD569\uB2C8\uB2E4."}),{status:400,headers:t});let a=g=>Object.prototype.hasOwnProperty.call(e,g),d=null;(!a("boost_value")||!a("is_pinned")||!a("pinned_score")||!a("pinned_platform"))&&(d=await i.DB.prepare("SELECT boost_value, is_pinned, pinned_score, pinned_platform FROM admin_boosts WHERE tmdb_id = ?").bind(o).first());let l=a("boost_value")?n||0:d?.boost_value??0,m=a("is_pinned")?_?1:0:d?.is_pinned||0,u=a("pinned_score")?c??0:d?.pinned_score??null,E=a("pinned_platform")?s||null:d?.pinned_platform??null,w=new Date(Date.now()+540*60*1e3).toISOString().slice(0,19).replace("T"," ");return await i.DB.prepare(`INSERT INTO admin_boosts (tmdb_id, boost_value, reason, is_pinned, pinned_score, pinned_platform, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(tmdb_id) DO UPDATE SET
         boost_value = excluded.boost_value,
         reason = excluded.reason,
         is_pinned = excluded.is_pinned,
         pinned_score = excluded.pinned_score,
         pinned_platform = excluded.pinned_platform,
         updated_at = excluded.updated_at`).bind(o,l,p||null,m,u,E,w).run(),new Response(JSON.stringify({ok:!0}),{status:200,headers:t})}catch(e){return new Response(JSON.stringify({ok:!1,error:e.message}),{status:500,headers:t})}}async function Mt(r,i,t,f){if(!await D(i,t))return new Response(JSON.stringify({ok:!1,error:"\uAD00\uB9AC\uC790 \uC778\uC99D\uC774 \uD544\uC694\uD569\uB2C8\uB2E4."}),{status:401,headers:f});try{return await t.DB.prepare("DELETE FROM admin_boosts WHERE tmdb_id = ?").bind(r).run(),new Response(JSON.stringify({ok:!0}),{status:200,headers:f})}catch(o){return new Response(JSON.stringify({ok:!1,error:o.message}),{status:500,headers:f})}}async function Ht(r,i,t){try{let f=new URL(r.url),e=parseInt(f.searchParams.get("limit")||"100",10),o=Number.isNaN(e)?100:Math.min(e,100),n=`
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
    `,{results:p}=await i.DB.prepare(n).bind(o).all();return!p||p.length===0?new Response(JSON.stringify({ok:!0,data:[]}),{status:200,headers:t}):new Response(JSON.stringify({ok:!0,data:p.map((_,c)=>({hot_rank:c+1,..._}))}),{status:200,headers:t})}catch(f){return console.error("getHot100 \uC624\uB958:",f),new Response(JSON.stringify({ok:!1,error:"HOT100 \uC870\uD68C \uC911 \uC624\uB958\uAC00 \uBC1C\uC0DD\uD588\uC2B5\uB2C8\uB2E4.",detail:f.message}),{status:500,headers:t})}}async function Ft(r,i,t){if(!await D(r,i))return new Response(JSON.stringify({ok:!1,error:"\uAD00\uB9AC\uC790 \uC778\uC99D\uC774 \uD544\uC694\uD569\uB2C8\uB2E4."}),{status:401,headers:t});try{let{results:e}=await i.DB.prepare(`SELECT platform, category_slot, top_n, display_order, is_active
       FROM hot100_frontend_tabs
       ORDER BY display_order ASC`).all();return new Response(JSON.stringify({ok:!0,data:e||[]}),{status:200,headers:t})}catch(e){return new Response(JSON.stringify({ok:!1,error:e.message}),{status:500,headers:t})}}async function Wt(r,i,t,f){if(!await D(i,t))return new Response(JSON.stringify({ok:!1,error:"\uAD00\uB9AC\uC790 \uC778\uC99D\uC774 \uD544\uC694\uD569\uB2C8\uB2E4."}),{status:401,headers:f});try{let o=await i.json(),{category_slot:n,top_n:p,display_order:_,is_active:c}=o;return await t.DB.prepare(`UPDATE hot100_frontend_tabs SET
         category_slot = COALESCE(?, category_slot),
         top_n         = COALESCE(?, top_n),
         display_order = COALESCE(?, display_order),
         is_active     = COALESCE(?, is_active)
       WHERE platform = ?`).bind(n??null,p??null,_??null,c??null,r).run(),new Response(JSON.stringify({ok:!0}),{status:200,headers:f})}catch(o){return new Response(JSON.stringify({ok:!1,error:o.message}),{status:500,headers:f})}}async function Ut(r,i,t){try{let e=new URL(r.url).searchParams.get("page"),o=`
      SELECT platform, category_slot, top_n, display_order
      FROM hot100_frontend_tabs
      WHERE is_active = 1
      ORDER BY display_order ASC
    `,n;if(e){let[l,m]=await i.DB.batch([i.DB.prepare("SELECT is_active FROM hot100_page_display WHERE page = ?").bind(e),i.DB.prepare(o)]),u=l.results[0]||null;if(!u||!u.is_active)return new Response(JSON.stringify({ok:!0,active:!1,tabs:[]}),{status:200,headers:t});n=m.results}else{let{results:l}=await i.DB.prepare(o).all();n=l}let p={all:"\uC804\uCCB4 \uC21C\uC704",netflix:"\uB137\uD50C\uB9AD\uC2A4",tving:"\uD2F0\uBE59",disney:"\uB514\uC988\uB2C8+",coupang:"\uCFE0\uD321\uD50C\uB808\uC774",wavve:"\uC6E8\uC774\uBE0C",boxoffice:"\uBC15\uC2A4\uC624\uD53C\uC2A4"},_=n;if(!_||_.length===0)return new Response(JSON.stringify({ok:!0,active:!0,tabs:[]}),{status:200,headers:t});let c=[];for(let l of _){let m=l.top_n||10;if(l.platform==="all"){c.push(i.DB.prepare(`SELECT h.tmdb_id, h.best_platform, w.title_ko, w.title_en,
                    w.poster_path, w.hero_backdrop_path, w.hero_custom_image_url, w.hero_title_baked_in,
                    w.hero_logo_path, w.media_type, ROUND(w.tmdb_rating, 1) AS tmdb_rating
             FROM hot100_scores h
             LEFT JOIN works w ON w.tmdb_id = h.tmdb_id
             ORDER BY h.total_score DESC
             LIMIT ?`).bind(m));continue}l.category_slot&&(c.push(i.DB.prepare(`SELECT r.rank, r.tmdb_id, r.title_ko, r.title_en, r.poster_path,
                  w.hero_backdrop_path, w.hero_custom_image_url, w.hero_title_baked_in,
                  w.hero_logo_path, w.media_type, ROUND(w.tmdb_rating, 1) AS tmdb_rating
           FROM rankings r
           LEFT JOIN works w ON w.tmdb_id = r.tmdb_id
           WHERE r.platform = ? AND r.category_slot = ?
             AND r.date = (
               SELECT MAX(date) FROM rankings
               WHERE platform = ? AND category_slot = ? AND date < 'manual'
             )
           ORDER BY r.rank ASC`).bind(l.platform,l.category_slot,l.platform,l.category_slot)),c.push(i.DB.prepare(`SELECT r.rank, r.tmdb_id, r.title_ko, r.title_en, r.poster_path,
                  w.hero_backdrop_path, w.hero_custom_image_url, w.hero_title_baked_in,
                  w.hero_logo_path, w.media_type, ROUND(w.tmdb_rating, 1) AS tmdb_rating
           FROM rankings r
           LEFT JOIN works w ON w.tmdb_id = r.tmdb_id
           WHERE r.platform = ? AND r.category_slot = ? AND r.is_manual = 1 AND r.date = 'manual'
           ORDER BY r.rank ASC`).bind(l.platform,l.category_slot)))}let s=c.length?await i.DB.batch(c):[],a=0,d=[];for(let l of _){let m=l.top_n||10;if(l.platform==="all"){let g=s[a++]?.results||[];d.push({platform:"all",label:p.all,items:g.map((y,k)=>({rank:k+1,tmdb_id:y.tmdb_id,best_platform:y.best_platform,title_ko:y.title_ko,title_en:y.title_en,poster_path:y.poster_path,hero_backdrop_path:y.hero_backdrop_path,hero_custom_image_url:y.hero_custom_image_url,hero_title_baked_in:y.hero_title_baked_in,hero_logo_path:y.hero_logo_path,media_type:y.media_type,tmdb_rating:y.tmdb_rating}))});continue}if(!l.category_slot)continue;let u=s[a++]?.results||[],E=s[a++]?.results||[],w=Z(u,E,m);d.push({platform:l.platform,label:p[l.platform]||l.platform,items:w.map(g=>({rank:g.rank,tmdb_id:g.tmdb_id,best_platform:l.platform,title_ko:g.title_ko,title_en:g.title_en,poster_path:g.poster_path,hero_backdrop_path:g.hero_backdrop_path,hero_custom_image_url:g.hero_custom_image_url,hero_title_baked_in:g.hero_title_baked_in,hero_logo_path:g.hero_logo_path,media_type:g.media_type,tmdb_rating:g.tmdb_rating}))})}return new Response(JSON.stringify({ok:!0,active:!0,tabs:d}),{status:200,headers:t})}catch(f){return new Response(JSON.stringify({ok:!1,error:"\uD788\uC5B4\uB85C \uD0ED \uC870\uD68C \uC911 \uC624\uB958\uAC00 \uBC1C\uC0DD\uD588\uC2B5\uB2C8\uB2E4.",detail:f.message}),{status:500,headers:t})}}async function Pt(r,i,t){if(!await D(r,i))return new Response(JSON.stringify({ok:!1,error:"\uAD00\uB9AC\uC790 \uC778\uC99D\uC774 \uD544\uC694\uD569\uB2C8\uB2E4."}),{status:401,headers:t});try{let e=30;try{let p=await r.json();p&&p.limit&&(e=Math.min(Math.max(parseInt(p.limit,10)||30,1),50))}catch{}let o=await It(i,e),n=await i.DB.prepare(`SELECT COUNT(*) AS cnt
       FROM hot100_scores h
       JOIN works w ON w.tmdb_id = h.tmdb_id
       WHERE COALESCE(w.hero_title_baked_in, 0) = 0
         AND w.hero_logo_checked_at IS NULL`).first();return new Response(JSON.stringify({ok:!0,...o,remaining:n?.cnt??0}),{status:200,headers:t})}catch(e){return new Response(JSON.stringify({ok:!1,error:"\uB85C\uACE0 \uBC31\uD544 \uC911 \uC624\uB958\uAC00 \uBC1C\uC0DD\uD588\uC2B5\uB2C8\uB2E4.",detail:e.message}),{status:500,headers:t})}}async function $t(r,i,t){if(!await D(r,i))return new Response(JSON.stringify({ok:!1,error:"\uAD00\uB9AC\uC790 \uC778\uC99D\uC774 \uD544\uC694\uD569\uB2C8\uB2E4."}),{status:401,headers:t});try{let e=await i.DB.prepare(`SELECT COUNT(*) AS cnt
       FROM hot100_scores h
       JOIN works w ON w.tmdb_id = h.tmdb_id
       WHERE COALESCE(w.hero_title_baked_in, 0) = 0
         AND w.hero_logo_checked_at IS NULL`).first();return new Response(JSON.stringify({ok:!0,remaining:e?.cnt??0}),{status:200,headers:t})}catch(e){return new Response(JSON.stringify({ok:!1,error:e.message}),{status:500,headers:t})}}async function xt(r,i,t){if(!await D(r,i))return new Response(JSON.stringify({ok:!1,error:"\uAD00\uB9AC\uC790 \uC778\uC99D\uC774 \uD544\uC694\uD569\uB2C8\uB2E4."}),{status:401,headers:t});try{let{results:e}=await i.DB.prepare("SELECT page, is_active FROM hot100_page_display ORDER BY page ASC").all();return new Response(JSON.stringify({ok:!0,data:e||[]}),{status:200,headers:t})}catch(e){return new Response(JSON.stringify({ok:!1,error:e.message}),{status:500,headers:t})}}async function jt(r,i,t,f){if(!await D(i,t))return new Response(JSON.stringify({ok:!1,error:"\uAD00\uB9AC\uC790 \uC778\uC99D\uC774 \uD544\uC694\uD569\uB2C8\uB2E4."}),{status:401,headers:f});try{let o=await i.json(),{is_active:n}=o;return await t.DB.prepare("UPDATE hot100_page_display SET is_active = ? WHERE page = ?").bind(n?1:0,r).run(),new Response(JSON.stringify({ok:!0}),{status:200,headers:f})}catch(o){return new Response(JSON.stringify({ok:!1,error:o.message}),{status:500,headers:f})}}async function Yt(r,i,t){try{let e=new URL(r.url).searchParams.get("page");if(!e)return new Response(JSON.stringify({ok:!1,error:"page \uD30C\uB77C\uBBF8\uD130\uAC00 \uD544\uC694\uD569\uB2C8\uB2E4."}),{status:400,headers:t});let o=await i.DB.prepare("SELECT is_active FROM hot100_page_display WHERE page = ?").bind(e).first();return new Response(JSON.stringify({ok:!0,is_active:!!(o&&o.is_active)}),{status:200,headers:t})}catch(f){return new Response(JSON.stringify({ok:!1,error:f.message}),{status:500,headers:t})}}var ds={async fetch(r,i,t){let f=new URL(r.url),e=f.pathname,o=r.headers.get("Origin")||"https://ottrank.kr",p=["https://ottrank.kr","http://localhost:8788","http://localhost:3000"].includes(o)?o:"https://ottrank.kr",_={"Content-Type":"application/json","Access-Control-Allow-Origin":p,"Access-Control-Allow-Credentials":"true"};if(r.method==="OPTIONS")return new Response(null,{headers:{"Access-Control-Allow-Origin":p,"Access-Control-Allow-Credentials":"true","Access-Control-Allow-Methods":"GET, POST, PUT, PATCH, DELETE, OPTIONS","Access-Control-Allow-Headers":"Content-Type, Authorization"}});let c=null;if(e.startsWith("/tmdb-img/"))return await Dt(e,r,i,t);(e.startsWith("/contents")||e.startsWith("/admin/contents"))&&(c=await Et(e,r,i,f,_)),!c&&e.startsWith("/auth/")&&(c=await mt(e,r,i,_)),!c&&(e.startsWith("/rankings")||e==="/latest-date"||e==="/platforms"||e==="/sitemap.xml")&&(c=await at(e,r,i,f,_)),!c&&(e==="/works/search"||e==="/works/exists"||e==="/works/ott-map"||e==="/works/details"||e==="/search-log")&&(c=await _t(e,r,i,f,_)),!c&&e.startsWith("/person-wiki")&&(c=await Lt(e,r,i,f,_)),!c&&(e.startsWith("/videos/")||e.startsWith("/admin/videos")||e.startsWith("/imdb/")||e.startsWith("/youtube/")||e.startsWith("/works/")||e.startsWith("/kmrb/")||e.startsWith("/search/"))&&(c=await lt(e,r,i,t,f,_)),!c&&(e.startsWith("/reactions")||e.startsWith("/admin/reactions"))&&(c=await pt(e,r,i,t,_)),!c&&(e.startsWith("/wishlist")||e.startsWith("/reviews")||e.startsWith("/mypage")||e.startsWith("/user/")||e==="/grade-settings"||e.startsWith("/life-works")||e.startsWith("/pick-lists")||e.startsWith("/admin/reviews"))&&(c=await ut(e,r,i,t,_)),!c&&e.startsWith("/posts")&&(c=await ft(e,r,i,t,f,_)),!c&&e.startsWith("/blog-gen")&&(c=await Nt(e,r,i,f,_)),!c&&e.startsWith("/work-ott")&&(c=await et(e,r,i,f,_)),!c&&(e==="/inquiry"||e.startsWith("/admin/inquiry"))&&(c=await ht(e,r,i,t,f,_)),!c&&e==="/admin/calc-hot100"&&(c=await At(r,i,_)),!c&&e==="/hot100"&&(c=await Ht(r,i,_)),!c&&e==="/hot100/hero-tabs"&&(c=await Ut(r,i,_)),!c&&e==="/admin/hot100/boosts/search"&&r.method==="GET"&&(c=await Bt(r,i,_)),!c&&e==="/admin/hot100/boosts"&&r.method==="GET"&&(c=await Ct(r,i,_)),!c&&e==="/admin/hot100/boosts"&&r.method==="POST"&&(c=await Jt(r,i,_));let s=e.match(/^\/admin\/hot100\/boosts\/(\d+)$/);!c&&s&&r.method==="DELETE"&&(c=await Mt(parseInt(s[1],10),r,i,_)),!c&&e==="/admin/hot100/frontend-tabs"&&r.method==="GET"&&(c=await Ft(r,i,_));let a=e.match(/^\/admin\/hot100\/frontend-tabs\/([a-z]+)$/);!c&&a&&r.method==="PATCH"&&(c=await Wt(a[1],r,i,_)),!c&&e==="/admin/hot100/backfill-logos"&&r.method==="POST"&&(c=await Pt(r,i,_)),!c&&e==="/admin/hot100/backfill-logos/status"&&r.method==="GET"&&(c=await $t(r,i,_)),!c&&e==="/admin/hot100/page-display"&&r.method==="GET"&&(c=await xt(r,i,_));let d=e.match(/^\/admin\/hot100\/page-display\/([a-z]+)$/);return!c&&d&&r.method==="PATCH"&&(c=await jt(d[1],r,i,_)),!c&&e==="/hot100/page-display"&&r.method==="GET"&&(c=await Yt(r,i,_)),!c&&e.startsWith("/admin/")&&(c=await et(e,r,i,f,_)),c||(c=new Response(JSON.stringify({ok:!1,message:"Not found"}),{status:404,headers:_})),c}};export{ds as default};
