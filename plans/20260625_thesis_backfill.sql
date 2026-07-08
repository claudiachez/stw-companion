-- Thesis backfill — populate holdings.summary / holdings.bullets / dd_source_url from the
-- per-ticker DD research files (~/Documents/Claude/Projects/Stock Talk Weekly/Tickers DD/<T>.md),
-- replacing the EPISODIC commentary the routines had stored in summary/bullets.
--
-- Boundary contract: plans/commentary_vs_transaction_boundary_spec.md (§2A summary↔bullets rule,
-- §3 CASE D). Source of truth = the DD files (DD-primary, enriched from comments only where it does
-- not contradict the DD). This is a DATA backfill, NOT a migration.
--
-- PREREQUISITE: migration 042_dd_source_urls.sql (adds holdings.dd_source_url + conviction_comments.source_url).
-- HOW TO RUN: paste into the Supabase SQL editor. Env-agnostic — STW trader resolved by name, so the
-- SAME file runs on PROD and sandbox. Review the RETURNING output of each block.
-- dd_updated_at = each DD file's "Posted" date. dd_source_url = each file's Discord "Source" link.
--
-- NOTE on $BAND (CXDO): spec §4 had the peer-growth comparison backwards. The DD is authoritative —
-- CXDO is the FASTER grower (+16% rev / +43% EPS) vs BAND (+4.9% / +1.4%). Fixed here.

-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- PART 1 — DD-sourced summary + bullets for the 36 tickers that have a DD file
-- ════════════════════════════════════════════════════════════════════════════════════════════════

update holdings set
  summary = $dd$Adeia's headline business is media IP, but the durable bull case is the optionality in its semiconductor IP book — hybrid bonding, advanced packaging, and wafer/die-to-wafer interconnect — which is becoming the primary scaling vector as Moore's Law slows and AI workloads hit memory-bandwidth, interconnect-density, and thermal limits. The thesis: that semiconductor IP is mispriced relative to the media business, and the gap should close as HBM4/HBM5 and advanced packaging go mainstream toward 2027.$dd$,
  bullets = $dd$["Position: $30C Jun @ $1.50 + $30C Sep @ $3.58 avg, ~2% (originally a @Mystic idea)","Licensees: SK Hynix (2020, DBI Ultra 3D), Micron (2022), Samsung, AMD (Mar 2026 settlement, multi-year license incl. hybrid bonding)","Customers: Micron, SanDisk, SK Hynix, AMD, Samsung, Sony, UMC, STMicro","Patent book ~13,750 patents/apps, ~80% internally generated (not aggregated) — differentiates from patent trolls","Margins: 87% gross / 47% operating / 27% net; ~12x EV/EBITDA, ~20x FCF","Why packaging matters: hybrid bonding stacks logic/memory/sensors at far denser interconnect, being designed into AI memory/logic"]$dd$::jsonb,
  dd_updated_at = '2026-05-11T00:00:00-04:00',
  dd_source_url = 'https://discord.com/channels/916525682887122974/1229546005788098580/1503432546460111001',
  updated_at = now()
where ticker = 'ADEA' and trader_id = (select id from traders where name = 'STW') returning ticker;

update holdings set
  summary = $dd$Amkor is a leading outsourced semiconductor assembly & test (OSAT) and advanced-packaging provider and a longstanding Broadcom supplier expanding advanced-packaging capacity domestically. The thesis is leverage to AI accelerator and chiplet packaging: as AVGO and TSM ramp custom AI silicon (the reported $10B+ mystery-customer order tied to OpenAI), Amkor — an advanced-packaging partner of both — is on the shortlist for any OSAT'd assembly/test, anchored by its TSMC-collaboration Arizona build.$dd$,
  bullets = $dd$["Won Broadcom Best Supplier Award (Wireless Semiconductor Division), 2024","Oct 2024 TSMC MOU: advanced packaging & test in Arizona — largest US OSAT facility (Peoria, AZ)","Advanced-packaging partner of both AVGO and TSM (TSM fabs ~90% of AVGO chips)","Catalyst: AVGO $10B+ AI-chip order (reported OpenAI) needs assembly/test capacity","Technical: holding above 200-week MA; swing while pinned between 9/21-week EMAs and 200-week SMA","Risk: high beta to AVGO/semis — fades with the group if structure breaks"]$dd$::jsonb,
  dd_updated_at = '2025-09-05T00:00:00-04:00',
  dd_source_url = 'https://discord.com/channels/916525682887122974/1229546005788098580/1413574501043671100',
  updated_at = now()
where ticker = 'AMKR' and trader_id = (select id from traders where name = 'STW') returning ticker;

update holdings set
  summary = $dd$Ameresco designs, builds, and finances energy-efficiency and distributed-energy projects (LED/HVAC retrofits, solar, storage, microgrids, RNG, CHP, EV) for governments, utilities, hospitals, the military, and increasingly datacenters — and is itself an energy asset owner/operator. The bull case is behind-the-meter power for AI datacenters that cannot get grid power online fast enough, on top of a large, visible backlog, at a valuation (0.8x sales) that has not re-rated like other power names.$dd$,
  bullets = $dd$["Position: 1.5% in Oct $35C @ $4.59","Asset base: 227 plants / ~838 MWe owned-operated, +853 MWe in development/construction","AI datacenter: Navy + CyrusOne 100 MW AI-ready datacenter at NAS Lemoore; Bloom Energy microgrid (Taylor Farms)","Visibility: Q1 2026 backlog $5.3B; total revenue visibility $10.6B; ~90% awarded-to-signed conversion","Asset validation: HASI valued Neogenyx biofuels at $1.8B post-money EV ($400M committed, $100M to AMRC at close)","Valuation: 0.8x sales — laggard vs other behind-the-meter power names"]$dd$::jsonb,
  dd_updated_at = '2026-05-14T00:00:00-04:00',
  dd_source_url = 'https://discord.com/channels/916525682887122974/1229546005788098580/1504537106955894835',
  updated_at = now()
where ticker = 'AMRC' and trader_id = (select id from traders where name = 'STW') returning ticker;

update holdings set
  summary = $dd$American Superconductor has transformed from an advanced-materials company into a domestic power-electronics and grid-infrastructure provider (now ~83% Grid / ~17% Wind, ~75-80% Americas), squarely in the U.S. grid theme. It pairs grid voltage-stabilization systems (D-VAR/FACTS), power conversion/magnetics, and transformers with a defense moat: it is the only supplier of HTS-based Ship Protection Systems qualified for U.S. Navy surface combatants. Held as a prospective position to upsize on pullbacks.$dd$,
  bullets = $dd$["Position: 1% (Prospective) @ $41.22; targeting upsize into MAs","Revenue mix: 83.5% Grid / 16.5% Wind; Neeltran/NWL/Comtrafo acquisitions add content per project","Defense moat: only HTS-based SPS qualified for US Navy surface combatants","Grid: D-VAR reactive-power/voltage support; synchronous-condenser tech validated by China HV first","Technical: breaking out across timeframes (daily >200 SMA, weekly >50 SMA, monthly testing 200 SMA)","Caveat: valuation requires continued growth — sizing reflects that"]$dd$::jsonb,
  dd_updated_at = '2026-04-21T00:00:00-04:00',
  dd_source_url = 'https://discord.com/channels/916525682887122974/1229546005788098580/1496324090988990636',
  updated_at = now()
where ticker = 'AMSC' and trader_id = (select id from traders where name = 'STW') returning ticker;

update holdings set
  summary = $dd$Array Technologies makes single-axis solar trackers for utility-scale solar farms (81% U.S. revenue). This is a tactical summer trade on a solar sector that is politically suppressed but fundamentally driven (ERCOT capacity adds roughly half solar), combining a clean technical setup, a ~20% short-interest squeeze setup, and a cheap valuation backed by a $2.4B orderbook equal to enterprise value.$dd$,
  bullets = $dd$["Position: tactical $9C Aug 21 @ $1.54, 1.5% (shorter-term trade)","Valuation: $2.4B orderbook ~= $2.4B EV; ~6-7x P/E; 1x sales","Squeeze setup: ~20% short interest","Sector: solar setup attractive alongside SHLS; ERCOT adds ~half solar","Risk: carries debt (manageable vs orderbook); tactical, not core"]$dd$::jsonb,
  dd_updated_at = '2026-06-04T00:00:00-04:00',
  dd_source_url = 'https://discord.com/channels/916525682887122974/1229546005788098580/1512164529323245699',
  updated_at = now()
where ticker = 'ARRY' and trader_id = (select id from traders where name = 'STW') returning ticker;

update holdings set
  summary = $dd$AeroVironment is a defense / directed-energy name held as a small, speculative far-dated-options trade around its LOCUST high-energy laser counter-drone system. The catalyst: AVAV completed a White Sands LOCUST test (with DoD/FAA coordination; the FAA found no added civilian-aircraft risk), and the DoD explicitly featured LOCUST in its directed-energy posts — with an anti-drone laser deal believed to be imminent.$dd$,
  bullets = $dd$["Position: small/speculative, far-dated calls (swing-trades channel)","Catalyst 1: White Sands LOCUST high-energy laser test, FAA safety review cleared","Catalyst 2: DoD posted LOCUST in energy-weapons coverage; AVAV amplified","Thesis horizon: anti-drone laser contract believed imminent (may take weeks/months)"]$dd$::jsonb,
  dd_updated_at = '2026-05-06T00:00:00-04:00',
  dd_source_url = 'https://discord.com/channels/916525682887122974/1229546005788098580/1501651534130184388',
  updated_at = now()
where ticker = 'AVAV' and trader_id = (select id from traders where name = 'STW') returning ticker;

update holdings set
  summary = $dd$The BlackBerry thesis is entirely about QNX — its safety-certified real-time operating system for systems where deterministic timing, isolation, and certification matter (automotive cockpits, robots, industrial controllers, medical devices). The market underprices the overlap between automotive ADAS and broader robotics (same thesis as VLN): modern cars are robots, and QNX is arguably the most complete end-to-end robotics platform, monetized via licenses, support, services, and volume royalties.$dd$,
  bullets = $dd$["Position: swing trade into September","QNX SDP 8.0: microkernel RTOS for mission/safety-critical, multicore (auto, industrial, robotics, medical)","QNX Hypervisor: safe workload consolidation for SDVs/robots; new x86 embedded support broadens beyond Arm","Revenue model: licenses + support/maintenance + services + volume-based shipment royalties","Telecom optionality: SecuSUITE/UEM/AtHoc secure comms; connected-vehicle/IoT IP","Technical: attempting breakout of a 5-year base (range back to 2012)"]$dd$::jsonb,
  dd_updated_at = '2026-05-06T00:00:00-04:00',
  dd_source_url = 'https://discord.com/channels/916525682887122974/1229546005788098580/1501658281943367773',
  updated_at = now()
where ticker = 'BB' and trader_id = (select id from traders where name = 'STW') returning ticker;

update holdings set
  summary = $dd$Belden is repositioning from a commodity cable maker into a higher-value industrial connectivity, automation, and cybersecurity platform — its Automation Solutions segment (IT/OT convergence) is now the majority of revenue and is margin-accretive, with growing double-digit solution sales that are stickier and larger. The bull case: a genuine mix shift with improving margins, strong FCF, and aggressive buybacks, at a cheap ~14x forward P/E versus power-grid and electrical peers.$dd$,
  bullets = $dd$["Valuation: 14x fwd P/E, 12x EV/EBITDA, 1.6x sales — cheap vs power-grid peers","Mix shift: Automation Solutions now majority of revenue, margin-accretive, double-digit solution growth","FY2025: revenue +10.3%, net income +19.7%, diluted EPS $4.80 to $5.91 (+23%, buyback-aided)","Two segments: Smart Infrastructure (connectivity/racks/broadband/DC) + Automation (IT/OT)","Anti-dilutive: buybacks shrinking the share count","Technical: weekly support at 100-week MA, 9/21 EMAs stacked above 50-week, curling up","Status: prospective — no position yet, awaiting a clean entry"]$dd$::jsonb,
  dd_updated_at = '2026-04-09T00:00:00-04:00',
  dd_source_url = 'https://discord.com/channels/916525682887122974/1229546005788098580/1491842208486265075',
  updated_at = now()
where ticker = 'BDC' and trader_id = (select id from traders where name = 'STW') returning ticker;

update holdings set
  summary = $dd$Ballard is a high-optionality hydrogen PEM fuel-cell platform with an unusually strong cash balance for its size, improving gross margins, and credible OEM relationships across buses, rail, marine, and stationary/datacenter power. It is both a quality sympathy play versus parabolic peers BE and FCEL (BLDP posts +9% gross margin vs FCEL's -16% at the same EV/sales) and a datacenter-backup-power optionality story validated by Vertiv, Caterpillar/Microsoft, and a DOE award.$dd$,
  bullets = $dd$["Position: 3% — split $4C Aug @ $0.90 / $5C Aug @ $0.60","Quality vs peer: +9% gross margin vs FCEL -16% at same EV/sales","Datacenter: CEO targeting DC backup power; Vertiv partnership (2024, 10-yr); Caterpillar+Microsoft DOE award (1.5 MW demo, Cheyenne WY)","Fundamentals: revenue +26% YoY; 2.3x cash / 2x book","Technical: weekly broke 200-week MA first time since 2022; monthly pushing flat 200-month with EMAs curling up","Nature: sympathy play to the BE/FCEL parabola"]$dd$::jsonb,
  dd_updated_at = '2026-05-15T00:00:00-04:00',
  dd_source_url = 'https://discord.com/channels/916525682887122974/1229546005788098580/1504908238150303875',
  updated_at = now()
where ticker = 'BLDP' and trader_id = (select id from traders where name = 'STW') returning ticker;

update holdings set
  summary = $dd$Cerence is the dominant automotive voice-AI platform — its technology was in 52% of all cars produced worldwide in 2025 (Hey Mercedes / BMW / Audi / Jeep). The thesis treats automotive AI as a cross-applicable platform for physical AI and robotics (cars are robots), with the hardest-environment voice problem (noise, multi-speaker, intermittent connectivity, safety) solved via an edge/cloud hybrid architecture that ports to dealership AI, industrial/IoT, and robotics — all at a deep-value multiple.$dd$,
  bullets = $dd$["Position: $10C Aug 21 '26 @ $1.85 avg, 1.5% (Voice AI basket, cross-applies to robotics)","Scale: Cerence tech in 52% of global auto production (2025)","Valuation: 13x fwd P/E, 6.5x FCF, 1.5x sales","Cross-application: management targeting dealership AI, commercial/industrial, IoT, robotics","xUI: LLM-powered in-vehicle agents; xUI vehicles entered production Q2 FY26","Lineage: same robotics thesis as VLN and BB (both worked)"]$dd$::jsonb,
  dd_updated_at = '2026-05-22T00:00:00-04:00',
  dd_source_url = 'https://discord.com/channels/916525682887122974/1229546005788098580/1507423161300549722',
  updated_at = now()
where ticker = 'CRNC' and trader_id = (select id from traders where name = 'STW') returning ticker;

update holdings set
  summary = $dd$CTS designs and manufactures custom engineered electronic components — the nervous system and motion system (sense, connect, move) inside vehicles, industrial equipment, medical devices, and defense electronics. The robotics angle is explicit (Hall-effect position sensors, Maglab current/position sensing for servos and AMRs/AGVs), reinforced by a unique niche as the world's largest fully integrated supplier of piezoelectric crystals — a bottleneck for RF, PNT, and subsea defense — with steadily improving margins and a shrinking share count.$dd$,
  bullets = $dd$["Three families: Sense, Connect, Move (sensors, filters/passives, microactuators)","Robotics: Hall-effect rotary position sensors; Maglab for motor control / servos / AMRs / AGVs","Niche moat: world's largest fully integrated piezoelectric-crystal supplier (RF, PNT, subsea defense)","Margins (2023 to 2025): gross 34.7% to 38.4% (Q4 39.1%); EBITDA 19.5% to 22.6% (Q4 25.2%)","Anti-dilutive: shares 31.68M to 28.76M (-9.2% in 3 yrs); net cash vs net-debt peers","Status: prospective — no position yet, awaiting entry"]$dd$::jsonb,
  dd_updated_at = '2026-04-09T00:00:00-04:00',
  dd_source_url = 'https://discord.com/channels/916525682887122974/1229546005788098580/1491856322415562822',
  updated_at = now()
where ticker = 'CTS' and trader_id = (select id from traders where name = 'STW') returning ticker;

update holdings set
  summary = $dd$Crexendo ($CXDO) is a profitable, founder-aligned small-cap in business communications software — a direct cloud UCaaS business plus the NetSapiens platform sold to carriers, MSPs, and resellers who white-label it. The bull case is a credible, profitable platform asset bigger than its size suggests: high-margin software growth, clean FCF conversion, and an accretive ESI acquisition (~1.3x sales) that scales revenue — with CXDO growing much faster than its parabolic peer BAND, attempting a ~20-year base breakout, plus AI-voice optionality via CAIRO.$dd$,
  bullets = $dd$["Position lineage: opened OTM calls 5/1; full DD 5/6","NetSapiens platform: comms software white-labeled by carriers/MSPs/resellers (recurring, sticky)","Faster than peer: CXDO rev +16% / EPS +43% TTM vs BAND +4.9% / +1.4% (CXDO is the fast grower)","ESI acquisition: $35M ($27.3M cash + $7.7M stock), ~$26M 2025 rev, 6,200+ accounts / 75,000+ seats, immediately accretive (only 1 month in last quarter)","Quality: fwd P/E ~20; FY2025 capex ~$18K so OCF converts almost directly to FCF; no customer >10% of rev/receivables (FY24-25)","AI optionality: CAIRO (AI receptionist/routing/intent/transcription/analytics)","Technical: attempting breakout of a ~20-year base with earnings momentum"]$dd$::jsonb,
  dd_updated_at = '2026-05-06T00:00:00-04:00',
  dd_source_url = 'https://discord.com/channels/916525682887122974/1229546005788098580/1501618963858067466',
  updated_at = now()
where ticker = 'CXDO' and trader_id = (select id from traders where name = 'STW') returning ticker;

update holdings set
  summary = $dd$EnerSys is a profitable, U.S.-based battery-systems OEM trading cheaply (~1x sales, ~10x P/E) while every other battery stock trades on hype — a real, growing, profitable business with dual exposure to the grid and data-center power themes. It pairs stationary/industrial battery and DC power systems (UPS, telecom/broadband power, switchgear, data-center DC plant) with a domestic-manufacturing tailwind (Section 45X credits) and a DOE-backed U.S. lithium-cell facility.$dd$,
  bullets = $dd$["Valuation: ~1x sales, ~10x P/E (vs hyped battery peers)","Two divisions: Energy Systems (UPS, telecom power, switchgear, storage) + New Ventures","DC power / data center: PowerSafe/DataSafe; Alpha DC (Cordex rectifiers, CXC HP controllers)","Catalyst: $199M DOE award for an SC lithium-cell plant (incl. DoD supply)","Domestic tailwind: $184.6M of Section 45X credits in FY25 (COGS reduction)","Position: shares @ $112.87 avg + $115C Dec/Mar '26; ~6.5% total","Caveat: high-beta to market pullbacks"]$dd$::jsonb,
  dd_updated_at = '2025-10-13T00:00:00-04:00',
  dd_source_url = 'https://discord.com/channels/916525682887122974/1229546005788098580/1427356116957794507',
  updated_at = now()
where ticker = 'ENS' and trader_id = (select id from traders where name = 'STW') returning ticker;

update holdings set
  summary = $dd$Five9 is a profitable, pure-play cloud contact-center (CCaaS) platform with a fast-inflecting voice-AI business — the diamond-in-the-rough thesis is that it becomes the end-to-end operating layer for enterprise customer-experience automation (voice, routing, agent assist, analytics, agentic AI). The key insight from management: when AI reduces agent seats, dollars are not leaving the contact center — spend shifts from labor to software, expanding Five9's addressable market.$dd$,
  bullets = $dd$["AI inflection: AI revenue +68% YoY (from +40%), >$125M run-rate, ~13% of subscription revenue (from 8%)","Valuation: 1.3x sales, 7x FCF, 0.42 PEG, 55% gross margin, no meaningful debt","TAM framing: $24B cloud CCaaS software + $210B contact-center labor-arbitrage via AI","Platform: marries voice, digital, and AI at the workflow layer","Customers: airlines, healthcare, retail, banks","Catalyst: new AI CEO (Feb 2026) as turnaround driver; totally neglected from $200 highs"]$dd$::jsonb,
  dd_updated_at = '2026-05-13T00:00:00-04:00',
  dd_source_url = 'https://discord.com/channels/916525682887122974/1229546005788098580/1504134258040639690',
  updated_at = now()
where ticker = 'FIVN' and trader_id = (select id from traders where name = 'STW') returning ticker;

update holdings set
  summary = $dd$Forgent is a newly public, high-growth manufacturer of electrical-distribution infrastructure for datacenters — transformers, switchgear, PDUs, RPPs, ATS, tap boxes that get power from the source to the GPU rack (42% of FY2025 revenue from datacenter). The thesis is a demand inflection (bookings +268%, book-to-bill 2.6) meeting a ~374% manufacturing-footprint expansion that should more than triple production and scale revenue from $753M to a guided $1.3B — with IPO overhang as the main risk.$dd$,
  bullets = $dd$["Demand: revenue +70% Y/Y, bookings +268%, book-to-bill 2.6, backlog +100% Y/Y","Ramp: +5 campuses / +1.8M sq ft (+374% footprint), supports up to ~$5B annual revenue","Scale: FY2025 $753M to FY2026 guide $1.3B; maintenance capex dropping to ~1% of revenue","Low concentration: no product >13%, no customer >9% of FY2025 revenue","Risk: Neos PE controls majority, diluted at $29.50 (3/30) — overhang; newly IPO'd","Position: Prospective, 1% @ $34.31 awaiting better entry"]$dd$::jsonb,
  dd_updated_at = '2026-04-21T00:00:00-04:00',
  dd_source_url = 'https://discord.com/channels/916525682887122974/1229546005788098580/1496338737133523034',
  updated_at = now()
where ticker = 'FPS' and trader_id = (select id from traders where name = 'STW') returning ticker;

update holdings set
  summary = $dd$Grid Dynamics is an undercover AI small-cap the host sees as wildly mispriced — $300M cash against a ~$500M market cap with zero debt — that supplies engineering talent (architects, data scientists, AI specialists, cloud engineers) to build enterprises' digital systems, AI tools, and data platforms. The bull case: double-digit revenue growth with AI now ~29% of revenue carrying +60% incremental contribution margins, a blue-chip customer set, and a partnership ecosystem spanning the major clouds and NVIDIA.$dd$,
  bullets = $dd$["Balance sheet: $300M cash vs ~$500M market cap, $0 debt","Growth/mix: revenue +17.5%; AI ~29.3% of revenue at +60% incremental contribution margins; ~35% blended GM","Customers: Google, PepsiCo, Fiserv, Raymond James, Boston Scientific, Merck, Macy's, American Eagle","Tech/media/telecom segment: 29.5% of revenue, +30.3% YoY (top-2 tech customers)","Partners: AWS, Google Cloud, Microsoft, NVIDIA, Snowflake","Position: $5C Jun @ $1.10 + $5C Sep @ $1.51, 2.5%; swing with conviction, high volatility tolerance"]$dd$::jsonb,
  dd_updated_at = '2026-05-06T00:00:00-04:00',
  dd_source_url = 'https://discord.com/channels/916525682887122974/1229546005788098580/1501597238835675258',
  updated_at = now()
where ticker = 'GDYN' and trader_id = (select id from traders where name = 'STW') returning ticker;

update holdings set
  summary = $dd$Great Lakes Dredge & Dock is a pure-play U.S. dredging name held as an extension of the HII shipbuilding/maritime thesis — the U.S. naval expansion and port build-out require dredging to deepen and widen channels for deep-draft warships. Its moat is the Foreign Dredge / Jones Act regime that bars foreign competition, and it is building Acadia, the first and only Jones Act-qualified subsea rock-installation vessel, with a policy catalyst in Trump's maritime-dominance executive order. (DD marks the name ACQUIRED — position may be closed.)$dd$,
  bullets = $dd$["Position: 4.5% — shares @ $13.95 + $12.5C Mar @ $1.75","Jones Act moat: foreign dredgers barred from U.S. dredging/coastwise trade","Acadia: first/only Jones Act-qualified SRI vessel under U.S. construction","Thesis linkage: extends the HII naval-expansion / maritime thesis (port access for warships)","Policy: Trump Restoring America's Maritime Dominance EO (port infra, navigation O&M funding)","Risk: ~7% of backlog offshore wind (muted under current admin)"]$dd$::jsonb,
  dd_updated_at = '2026-01-15T00:00:00-04:00',
  dd_source_url = 'https://discord.com/channels/916525682887122974/1229546005788098580/1461386024574779575',
  updated_at = now()
where ticker = 'GLDD' and trader_id = (select id from traders where name = 'STW') returning ticker;

update holdings set
  summary = $dd$Huntington Ingalls is the largest U.S. military shipbuilder, held as the pure-play on a shipbuilding spending priority — the $150B defense supplemental allocated $29B to shipbuilding, a larger allocation than expected. At an ~$8.5B market cap it offers concentrated exposure to that allocation versus diversified defense primes, entered as price reclaimed the 200-day with the catalyst in place.$dd$,
  bullets = $dd$["Catalyst: $150B defense supplemental, $29B to shipbuilding (above expectations)","Scale: largest U.S. military shipbuilder at ~$8.5B market cap — pure-play vs diversified primes","Entry: building mostly shares, no hard stop, add on weakness","Basket: alongside ERJ, KTOS, MRCY, DRS, AMTM, BWXT, AVAV; Golden Dome ($29B) also in package","Technical: reclaimed the 200-day with catalyst in place"]$dd$::jsonb,
  dd_updated_at = '2025-04-25T00:00:00-04:00',
  dd_source_url = 'https://discord.com/channels/916525682887122974/1229546005788098580/1365289689166123018',
  updated_at = now()
where ticker = 'HII' and trader_id = (select id from traders where name = 'STW') returning ticker;

update holdings set
  summary = $dd$Iridium is a deeply cheap (6x P/FCF, 8x EV/EBITDA) satellite operator held as cross-theme exposure to both space/satellites and drones. Beyond the original space-exposure lotto / potential acquisition candidate, the expanded thesis is Iridium's defensible role as resilient connectivity and PNT for uncrewed aerial vehicles — beyond-line-of-sight command & control and GNSS-jam-resistant navigation that is safety-critical for drones.$dd$,
  bullets = $dd$["Valuation: 6x P/FCF, 8x EV/EBITDA — cheapest in the space/satellite theme","Drone connectivity: BVLOS command & control / telemetry via L-band / Certus","Resilient PNT: Satellite Time & Location (STL) mitigates GNSS jamming/spoofing","Validation: NASA Vanilla Unmanned UAV demo; CEO calls it a fail-safe connection for drones","Cross-theme: space/satellites + drones; possible acquisition candidate","Origin: started as a 0.8% extreme-lotto space-exposure trade, thesis expanded"]$dd$::jsonb,
  dd_updated_at = '2025-12-12T00:00:00-04:00',
  dd_source_url = 'https://discord.com/channels/916525682887122974/1229546005788098580/1448915209766043740',
  updated_at = now()
where ticker = 'IRDM' and trader_id = (select id from traders where name = 'STW') returning ticker;

update holdings set
  summary = $dd$Itron is the #1 metering company in North America (~60% of electric AMI share; 75% of all U.S. power touches Itron tech), an end-to-end grid-edge provider of smart meters, sensors, network infrastructure, and software that lets utilities detect outages, find leaks/theft, forecast demand, and integrate solar/storage/EV. The thesis is U.S. grid-modernization exposure (81% North America revenue) at a cheap multiple, with the company already hitting its 2027 margin/FCF targets two years early.$dd$,
  bullets = $dd$["Share: #1 NA metering, ~60% electric AMI; ~2/3 of revenue tied to electricity","Networked Solutions: ~2/3 of revenue (endpoints + network + headend + software)","Ahead of plan: hit 2027 targets early — 38% GM, 16.2% FCF (vs 37% / 12% targets)","Valuation: ~14x fwd P/E, 13x EV/EBITDA, <2x sales — cheaper than HUBB/XYL","Geography: 81% North America","Position: 5.5%, all common @ $99.10; below 200-day at entry (expect volatility)"]$dd$::jsonb,
  dd_updated_at = '2026-02-20T00:00:00-04:00',
  dd_source_url = 'https://discord.com/channels/916525682887122974/1229546005788098580/1474445107519295498',
  updated_at = now()
where ticker = 'ITRI' and trader_id = (select id from traders where name = 'STW') returning ticker;

update holdings set
  summary = $dd$Centrus Energy is a uranium-enrichment name entered as a trade on a U.S. uranium-independence initiative, of which the host expects Centrus to be a major beneficiary, on a strong daily chart setup. The thesis is light — entered as a news/technical trade rather than a deep DD.$dd$,
  bullets = $dd$["Entry: re-entered after-hours on uranium-independence news, fills $96-97","Catalyst: potential major beneficiary of a U.S. uranium-independence initiative","Technical: strong daily chart setup at entry","Nature: news/technical trade — light thesis, details still emerging"]$dd$::jsonb,
  dd_updated_at = '2025-05-22T00:00:00-04:00',
  dd_source_url = 'https://discord.com/channels/916525682887122974/1229546005788098580/1375232481804026018',
  updated_at = now()
where ticker = 'LEU' and trader_id = (select id from traders where name = 'STW') returning ticker;

update holdings set
  summary = $dd$Lumen is an AI-infrastructure connectivity turnaround: a 340k+ route-mile fiber network being repositioned as the transport layer for AI and multi-cloud workloads, anchored by marquee partnerships (first AWS Interconnect last-mile partner, the only SMID-cap Oracle OCI FastConnect partner, and Anthropic's chosen partner to expand North American fiber). A major debt de-risking — the AT&T FTTH sale funded ~$4.8B of debt reduction, ~45% lower interest, sub-4x leverage, and ratings upgrades — converts a balance-sheet risk into an inflection.$dd$,
  bullets = $dd$["AI/cloud transport: AWS Interconnect last-mile (first partner); only SMID-cap Oracle OCI FastConnect partner; Anthropic NA fiber expansion (Feb 2026)","Scale: 340k+ route miles, ~163k on-net buildings, 226 metros; PCF sales ~$13B, NaaS +29%","De-risking: AT&T FTTH sale, ~$4.8B debt reduction, interest -45%, leverage <4x, capex -$1B+; Fitch upgrade to B","China read-through: FCC limits on Covered List entities favor trusted domestic transport","Position: 2.5% starter, options only ($8C Jul, $7C Jan '27, small $8C May)","Technical: golden cross (Aug); 200-month SMA resistance ~$11. Risk: still-elevated debt"]$dd$::jsonb,
  dd_updated_at = '2026-04-15T00:00:00-04:00',
  dd_source_url = 'https://discord.com/channels/916525682887122974/1229546005788098580/1494031225986482338',
  updated_at = now()
where ticker = 'LUMN' and trader_id = (select id from traders where name = 'STW') returning ticker;

update holdings set
  summary = $dd$Mitek is an identity/fraud-verification play on AI-driven fraud: as deepfakes and synthetic identities outpace legacy controls, its Verified Identity Platform (MiVIP) unifies verification, authentication, liveness/deepfake detection, and fraud analytics — while it still runs a near-monopoly check-verification rail. The under-appreciated edge is distribution: it already powers 1B+ mobile deposits a year, an embedded foothold inside regulated banks now forced to upgrade defenses.$dd$,
  bullets = $dd$["Mix shift: Fraud & Identity ~$25M (+30% YoY) overtaking Check (~$19M, +6%); TTM 51% vs 49%","Q1 FY26: total revenue ~$44M (+19% YoY)","Check moat: 1.2B transactions/yr, ~99% market share — pricing power","Biometrics stack (ID R&D): IDLive Face (liveness), IDLive Doc (document liveness)","Distribution rail: 1B+ mobile deposits/yr; majority of NA financial institutions","Sector signal: $YOU strong Clear1 quarter confirms the trend"]$dd$::jsonb,
  dd_updated_at = '2026-02-25T00:00:00-04:00',
  dd_source_url = 'https://discord.com/channels/916525682887122974/1229546005788098580/1476261044715262095',
  updated_at = now()
where ticker = 'MITK' and trader_id = (select id from traders where name = 'STW') returning ticker;

update holdings set
  summary = $dd$Nebius is an AI-infrastructure / data holding entered as a trade on ClickHouse and AI-data catalysts — Nebius owns 28% of ClickHouse (raising at a $6B valuation) and Bezos Ventures led an investment in its AI-data business. The host is leveraging prior NBIS trade profits to build a position, adding on pullbacks toward $24-25. Light, catalyst-driven note rather than a deep DD.$dd$,
  bullets = $dd$["Catalyst: ClickHouse raising at $6B; NBIS owns 28% of ClickHouse","Catalyst: Bezos Ventures lead investor in its AI-data business","Approach: leveraging prior-trade profits; add on pullbacks into $24-25","Nature: catalyst-driven trade note — light thesis"]$dd$::jsonb,
  dd_updated_at = '2025-05-09T00:00:00-04:00',
  dd_source_url = 'https://discord.com/channels/916525682887122974/1229546005788098580/1370504250681065523',
  updated_at = now()
where ticker = 'NBIS' and trader_id = (select id from traders where name = 'STW') returning ticker;

update holdings set
  summary = $dd$One Stop Systems designs rugged, high-performance edge compute, PCIe switch fabrics, and flash storage for AI Transportables — datacenter-class AI and sensor processing in vehicles, aircraft, ships, and other harsh environments. It is a high-growth, near-profitability, effectively debt-free small-cap with multi-theme exposure (defense as the core growth focus, plus autonomous vehicles, aerospace, and AI datacenter), positioned to win as AI compute moves to the battlefield and the edge.$dd$,
  bullets = $dd$["Position: 4.5% in shares @ $4.71 avg (very volatile, not for the faint of heart)","Financials: Q3 2025 revenue $18.8M (+37% YoY), 35.7% GM, near profitability, ~zero debt","Defense (core): AI mission computers for vehicles, aircraft, drones, ships, radar/EW; GENESIS MISSION catalyst","Edge focus: foregoes low-margin clean-room servers (Dell/HPE/Oracle) for highest-performance edge AI","Datacenter: Ponto Gen-5 / Gen-6 CopprLink target 16+ GPU chassis; works with all GPUs/ASICs/TPUs","Segments: OSS (US, rugged servers) + Bressner (Germany, distribution)"]$dd$::jsonb,
  dd_updated_at = '2025-11-26T00:00:00-04:00',
  dd_source_url = 'https://discord.com/channels/916525682887122974/1229546005788098580/1443255710291988602',
  updated_at = now()
where ticker = 'OSS' and trader_id = (select id from traders where name = 'STW') returning ticker;

update holdings set
  summary = $dd$Everpure (formerly Pure Storage, ticker $P) sells enterprise all-flash data-storage systems and storage-as-a-service to hyperscalers, differentiated by its DirectFlash / Direct-to-NAND design that talks directly to raw flash for advantages in density, cost, power, and performance. Held as a small options flier — valuation is rich and memory input costs are high, but accelerating growth and high margins give option upside.$dd$,
  bullets = $dd$["Position: 0.5%, entirely options (flier/lotto) — rich valuation, execution risk","Differentiation: DirectFlash / Direct-to-NAND; 300TB module (18x a HDD, 7x largest SSD)","Margins/quality: ~70% GM (67% product vs ~50% NetApp); $1.5B net cash, no debt","Growth: revenue accel +12% to +20% across FY26; Q1 FY27 guide +27-30%; EPS +75% YoY","Base: 14,500+ customers, ~64% of Fortune 500, no customer >10%","vs NTAP: hardware/media differentiation vs NetApp software layer"]$dd$::jsonb,
  dd_updated_at = '2026-04-27T00:00:00-04:00',
  dd_source_url = 'https://discord.com/channels/916525682887122974/1229546005788098580/1498403653349019700',
  updated_at = now()
where ticker = 'P' and trader_id = (select id from traders where name = 'STW') returning ticker;

update holdings set
  summary = $dd$Pangaea Logistics is the real-economy expression of the Arctic build-out — an ice-class dry-bulk shipping operator whose fleet is 30% Ice Class 1A (vs peers at far weaker ratings), letting it command TCE rates ~10% above market. As Arctic commercial and military activity (Greenland / High North resupply) grows, demand for scarce ice-capable tonnage commands premiums; Pangaea is the only U.S. company to have built a pop-up port in Greenland, proving capability.$dd$,
  bullets = $dd$["Fleet moat: 30% Ice Class 1A (vs CMBT ~10% at weaker 1C); world's largest high-ice-class Panamax/post-Panamax dry-bulk fleet","Pricing: ice-class niche drives TCE ~10% above market","Proof point: only U.S. company to build a Greenland pop-up port (Moriusaq); northernmost dry-bulk cargo","Tailwind: Arctic traffic growth + Greenland/High North defense resupply (Pituffik)","Valuation: 10x fwd P/E, 10x P/FCF, 0.8x sales; revenue +15% YoY","Position: 4% shares @ $7.23 + small $7.5C May"]$dd$::jsonb,
  dd_updated_at = '2026-01-22T00:00:00-04:00',
  dd_source_url = 'https://discord.com/channels/916525682887122974/1229546005788098580/1463918659146743961',
  updated_at = now()
where ticker = 'PANL' and trader_id = (select id from traders where name = 'STW') returning ticker;

update holdings set
  summary = $dd$Preformed Line Products is the closest thing to a pure-play power-grid hardware name — an international maker of the dead-ends, splices, connectors, substation fittings, insulators, and protective hardware that go on every new power line or substation, with the most energy-heavy revenue mix among peers (~71% Energy). Held as a grid-infrastructure position; the very small float makes it volatile and entry-sensitive.$dd$,
  bullets = $dd$["Mix: ~71% Energy / ~22% Communications (most energy-heavy among peers)","Products: dead-ends, splices, connectors, substation fittings, spacer-dampers, insulators, wildlife guards","Valuation: 1.5x sales, 11x EV/EBITDA","Position: shares @ $189.78 avg, 6.5%; no options (tiny float)","Risk: <5M shares out / ~2.5M float — highly volatile, do not chase"]$dd$::jsonb,
  dd_updated_at = '2025-10-08T00:00:00-04:00',
  dd_source_url = 'https://discord.com/channels/916525682887122974/1229546005788098580/1425512020664520784',
  updated_at = now()
where ticker = 'PLPC' and trader_id = (select id from traders where name = 'STW') returning ticker;

update holdings set
  summary = $dd$RADCOM sells cloud-native telecom assurance, observability, and analytics software to carriers — its RADCOM ACE platform provides end-to-end RAN-to-core visibility, real-time troubleshooting, and closed-loop analytics for 3G/4G/5G. It sits in the same buyer/budget niche as VIAV (the host's largest position) and former winner NTCT, with an AI-displacement moat built on proprietary real-time telecom data and deep workflow embedding, at a cheap multiple with GAAP profitability.$dd$,
  bullets = $dd$["Platform: RADCOM ACE (RAN-to-core assurance) + AIM/NetTalk/Neura (AI anomaly detection, agentic interfaces)","Peer/niche: same buyer as VIAV and NTCT; named competitor in its own 20-F","Valuation: <2x cash, 10x fwd P/E, 12x EV/EBITDA, 75% GM, 17% net margin; GAAP profitable, growing double digits","Partners: AWS, Google Cloud, Azure, NVIDIA, AT&T, Rakuten, DISH/EchoStar","Risk: high customer concentration (top 3 = 86% of 2025 revenue)","Position: 5%, all shares @ $12.91; geography 85% ex-Asia"]$dd$::jsonb,
  dd_updated_at = '2026-04-23T00:00:00-04:00',
  dd_source_url = 'https://discord.com/channels/916525682887122974/1229546005788098580/1496904062891851979',
  updated_at = now()
where ticker = 'RDCM' and trader_id = (select id from traders where name = 'STW') returning ticker;

update holdings set
  summary = $dd$Shoals Technologies is an electrical-balance-of-systems (EBOS) supplier at the intersection of utility-scale solar, battery storage, and emerging AI data-center critical power. Its flagship Big Lead Assembly cuts solar wire runs by up to 95%, and the newer DC Recombiner extends it into BESS and datacenter UPS/battery architectures — a partnership with ON.energy puts Shoals into what will be the largest battery project on a U.S. AI datacenter, potentially moving SHLS beyond the solar cycle into higher-growth critical power.$dd$,
  bullets = $dd$["Recent quarter: Q1 revenue $141M (+75% YoY); record backlog/awarded $758M; FY26 guide raised to $600-640M","Valuation: 3x sales, 20x fwd P/E","BLA: trunk-bus replacing wire runs/combiner boxes (up to 95% fewer runs)","AI datacenter: 4000A DC Recombiner; ON.energy partnership, largest U.S. AI-datacenter battery project; >$1M Q1 revenue from new units","TAM expansion: 4000A opportunity ~$50-60M per GW vs ~$535M TTM revenue base","Position: 2% in Oct $10C @ $1.95"]$dd$::jsonb,
  dd_updated_at = '2026-05-15T00:00:00-04:00',
  dd_source_url = 'https://discord.com/channels/916525682887122974/1229546005788098580/1504882010626199772',
  updated_at = now()
where ticker = 'SHLS' and trader_id = (select id from traders where name = 'STW') returning ticker;

update holdings set
  summary = $dd$Synaptics is an edge-compute and on-device-inference play — its SL2610 family integrates Arm CPUs, GPUs, and the Torq AI accelerator so OEMs can build devices that see/hear and run AI models locally, paired with connectivity (the Astra IoT platform). The durable thesis is a deepening Google partnership (first strategic silicon partner for Google's Coral NPU) and management's 25-30% IoT CAGR guide, at a cheap sub-1 PEG.$dd$,
  bullets = $dd$["SL2610: Arm CPU + GPU + Torq AI accelerator; first production deployment of Google Coral NPU","Google: Edge AI for IoT collaboration (Jan 2025); named first strategic silicon partner for Coral NPU","Astra platform: AI-native IoT compute (SL MPUs + SR MCUs + software + connectivity)","Guide: management 25-30% IoT CAGR over 4 years","Valuation: 15x fwd P/E, 3x sales, PEG 0.82","Position: shares @ $85.78, 6% weight; potential core if earnings corroborate"]$dd$::jsonb,
  dd_updated_at = '2026-01-14T00:00:00-04:00',
  dd_source_url = 'https://discord.com/channels/916525682887122974/1229546005788098580/1461039826760499220',
  updated_at = now()
where ticker = 'SYNA' and trader_id = (select id from traders where name = 'STW') returning ticker;

update holdings set
  summary = $dd$T1 Energy is held primarily as a technical entry with thematic complement to the host's solar exposure (alongside SHLS) — entered on a clean retrace into the 9-week EMA, with a Roth note dismissing a Fuzzy Panda short report as supporting context. The stock is highly volatile and managed with tight risk; largely a technical/thematic trade rather than a deep fundamental DD.$dd$,
  bullets = $dd$["Position: shares @ $7.87 avg, 6% (avoiding options — IV too high)","Entry: clean retrace into 9-week EMA; will allow gravity into 100 SMA, tight risk if lost","Thematic: solar complement to SHLS","Context: Roth dismissed the Fuzzy Panda short report","Nature: volatile; primarily a technical/thematic trade"]$dd$::jsonb,
  dd_updated_at = '2026-06-11T00:00:00-04:00',
  dd_source_url = 'https://discord.com/channels/916525682887122974/1229546005788098580/1514701099473567776',
  updated_at = now()
where ticker = 'TE' and trader_id = (select id from traders where name = 'STW') returning ticker;

update holdings set
  summary = $dd$Thermon is a niche industrial-technology specialist in engineered process heating — electric heat tracing, industrial heaters/boilers, and controls for energy, chemicals, power, and increasingly datacenters. The thesis is a business inflection from a new datacenter focus (Poseidon/Pontus liquid load banks for HPC commissioning) layered on a steadily margin-improving core, at a reasonable multiple with manageable leverage. (DD marks the name ACQUIRED — position may be closed.)$dd$,
  bullets = $dd$["Datacenter inflection: Poseidon/Pontus liquid load banks for HPC/datacenter commissioning","Latest quarter: revenue $131.7M (+14.9% YoY), GM 46.4%, adj EBITDA margin 23.2%, backlog $251.3M (+16.9%)","Margins (FY23 to 25): gross 42.0% to 44.7%; operating 12.5% to 16.0%","Valuation: 18x P/E, 2x sales; net debt $110M / 1.0x leverage","Position: 4.5% equity @ $36.59 + small $35C Feb @ $3.60"]$dd$::jsonb,
  dd_updated_at = '2025-12-04T00:00:00-04:00',
  dd_source_url = 'https://discord.com/channels/916525682887122974/1229546005788098580/1446193796135129200',
  updated_at = now()
where ticker = 'THR' and trader_id = (select id from traders where name = 'STW') returning ticker;

update holdings set
  summary = $dd$VIAVI is a network-test company — the speedometers and X-ray machines that prove high-speed networks work — that is increasingly a datacenter-test name as networks jump 400G to 800G to 1.6T to feed AI clusters, on top of a second business in anti-counterfeit optical pigments. The thesis pairs that AI-driven datacenter growth vector with the Spirent acquisition (~$180M added NSE revenue) and an inner-loop position in merchant-silicon Ethernet roadmaps (Broadcom 224G SerDes).$dd$,
  bullets = $dd$["AI datacenter: 1.6T Ethernet test for AI workloads; field testers to 800G; datacenter is the growth vector","Ecosystem: Broadcom (224G SerDes in ONE-1600 1.6T), Lumentum (early 1.6T customer), Windstream (first transatlantic 800G), unnamed AI hyperscalers","Spirent acquisition: ~$180M added NSE revenue in first 12 months; broadens ethernet/security/AI portfolio","Fundamentals: top line high-single-digit, bottom line double-digit growth; 29 P/E","Position: largest/anchor; shares @ $13.58 avg + $14C Dec/Mar '26; ~4.5% (earnings risk)"]$dd$::jsonb,
  dd_updated_at = '2025-10-24T00:00:00-04:00',
  dd_source_url = 'https://discord.com/channels/916525682887122974/1229546005788098580/1431355696464662639',
  updated_at = now()
where ticker = 'VIAV' and trader_id = (select id from traders where name = 'STW') returning ticker;

update holdings set
  summary = $dd$Valens Semiconductor is a sensor-data connectivity company for edge-AI systems — the high-bandwidth nervous-system layer that moves high-resolution camera data from a robot's eyes to its brain, complementary to the rest of the robotics basket (SYNA, OSS, VPG, CTS). Its VA7000 MIPI A-PHY SerDes chipset and standards leadership (HDBaseT, A-PHY) give it credibility across ADAS/AV, industrial vision, medical, and robotics, at a basement valuation barely above cash.$dd$,
  bullets = $dd$["Product: VA7000 — MIPI A-PHY-compliant SerDes (long-reach, low-latency video + control + power)","Standards leadership: HDBaseT and MIPI A-PHY ecosystem position","Cross-application: ADAS/AV, industrial vision, medical, robotics","Valuation: 1.7x cash, 1.5x book, 1.0x EV/sales — zero expectations priced","Balance sheet: ~$92.6M cash, no debt, 12+ months liquidity (OCF -$12.7M FY25, not yet profitable)","Position: 5.5%, all shares @ $1.57 (former SPAC, high volatility); MA pinch bottoming setup"]$dd$::jsonb,
  dd_updated_at = '2026-04-30T00:00:00-04:00',
  dd_source_url = 'https://discord.com/channels/916525682887122974/1229546005788098580/1499426855831212105',
  updated_at = now()
where ticker = 'VLN' and trader_id = (select id from traders where name = 'STW') returning ticker;

update holdings set
  summary = $dd$Vishay Precision Group makes the precision force/strain/weight/pressure sensing nervous-system parts for machines, robots, and test systems, built on a Bulk Metal Foil franchise that trims to extremely tight, stable tolerances. The durable thesis is the humanoid-robotics optionality — strain-gauge force/torque sensing is standard in robotics, and VPG is landing repeat prototype/pre-production orders from multiple humanoid developers — a traction-not-revenue-yet story that could transform overnight if any scales.$dd$,
  bullets = $dd$["Three engines (2025 rev): Sensors $115.6M, Weighing $111.1M, Measurement Systems $80.4M; 75% US/Europe","Humanoid traction: $4M of 2025 prototype/pre-production orders (~3.5% of Sensors) from three developers; +$1.0M Jan 2026","Tech moat: Bulk Metal Foil precision resistors (semiconductor test, batteries, satellite C&C, autonomous)","Datacenter angle: precision resistors in optical transceivers and Micro-ITLAs (coherent optics)","Technical: 6-year range, flipping highs to support toward $56 retest; monthly chart strong","Position: Prospective, 1% @ $53.16 awaiting better entry"]$dd$::jsonb,
  dd_updated_at = '2026-04-22T00:00:00-04:00',
  dd_source_url = 'https://discord.com/channels/916525682887122974/1229546005788098580/1496529847382446261',
  updated_at = now()
where ticker = 'VPG' and trader_id = (select id from traders where name = 'STW') returning ticker;

-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- PART 2 — No DD file: move the episodic summary/bullets to a Commentary row, then clear them
-- (per the rule: anything in the highlight/bullets of a ticker without a DD file is commentary).
-- RNG and KTOS have real episodic content; preserve it as a comment, then null the durable fields.
-- ════════════════════════════════════════════════════════════════════════════════════════════════

insert into conviction_comments (ticker, trader_id, event_date, conviction_level, comment, source, user_id)
select h.ticker, h.trader_id,
       coalesce(h.dd_updated_at::date, current_date),
       coalesce(h.conviction, 3),
       h.summary || coalesce(
         E'\n\n' || (select string_agg('• ' || b.value, E'\n')
                     from jsonb_array_elements_text(h.bullets) b),
         ''),
       'discord', null
from holdings h
where h.ticker in ('RNG','KTOS')
  and h.trader_id = (select id from traders where name = 'STW')
  and h.summary is not null and h.summary <> ''
returning ticker, left(comment, 60);

update holdings set summary = null, bullets = '[]'::jsonb, updated_at = now()
where ticker in ('RNG','KTOS') and trader_id = (select id from traders where name = 'STW')
returning ticker;

-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- PART 3 — Legacy stubs: summary holds a placeholder ("Legacy position."), not durable thesis and
-- not a view worth preserving. Null it (no DD file; nothing to move to commentary).
-- ════════════════════════════════════════════════════════════════════════════════════════════════

update holdings set summary = null, bullets = '[]'::jsonb, updated_at = now()
where ticker in ('AMZN','HOOD','TSLA') and trader_id = (select id from traders where name = 'STW')
  and summary is not null
returning ticker;
