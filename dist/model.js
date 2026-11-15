export const VERSION = 1;
export const STORAGE_KEY = 'zhicuo.workbench.v1';
export const SUBJECTS = ['数学', '物理', '英语', '化学', '生物', '语文', '其他'];
export const KNOWLEDGE_LIBRARY_VERSION = 2;
export const REASONS = ['概念不清', '知识遗忘', '审题遗漏', '计算失误', '方法不当', '推理不严', '表达不规范', '时间不足'];
export const INTERVALS = [1, 2, 4, 7];
export const uid = () => globalThis.crypto?.randomUUID?.() || `id-${Date.now()}-${Math.random().toString(36).slice(2)}`;
export function today(now = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
}
export function addDays(day, n) {
  const d = new Date(`${day}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
export function dateLabel(day) {
  if (!day) return '复习已完成';
  const delta = Math.round((new Date(`${day}T12:00Z`) - new Date(`${today()}T12:00Z`)) / 86400000);
  if (delta === 0) return '今天';
  if (delta === 1) return '明天';
  if (delta < 0) return `逾期 ${-delta} 天`;
  return `${day.slice(5).replace('-', '月')}日`;
}
export const activeRecords = state => state.records.filter(r => !r.archived);
export function dueRecords(state, date = today()) {
  return activeRecords(state).filter(r => r.nextReview && r.nextReview <= date).sort((a,b) => a.nextReview.localeCompare(b.nextReview) || a.stage-b.stage);
}
export function knowledgeStats(state) {
  return state.knowledge.map(k => {
    const records = activeRecords(state).filter(r => r.knowledgeIds.includes(k.id));
    const mastered = records.filter(r => r.status === 'mastered').length;
    return { ...k, records, total: records.length, mastered, rate: records.length ? Math.round(mastered / records.length * 100) : 0 };
  });
}
export function applyReview(state, recordId, mastered, date = today()) {
  const record = state.records.find(r => r.id === recordId);
  if (!record || record.archived) throw new Error('题目不存在或已移入回收站');
  record.stage = mastered ? Math.min(record.stage + 1, 4) : 0;
  record.status = mastered ? 'mastered' : 'reviewing';
  record.nextReview = record.stage >= 4 ? null : addDays(date, INTERVALS[record.stage]);
  record.lastReviewed = date;
  record.updatedAt = date;
  state.logs.push({ id: uid(), recordId, date, mastered: !!mastered, stage: record.stage, demo: !!record.demo });
  return record;
}
export function learningPath(knowledge, ids) {
  const result = [], visiting = new Set(), done = new Set();
  function visit(id) {
    if (done.has(id)) return;
    if (visiting.has(id)) throw new Error('知识点前置关系存在循环，请调整');
    const node = knowledge.find(k => k.id === id);
    if (!node) return;
    visiting.add(id);
    node.prerequisites.forEach(visit);
    visiting.delete(id); done.add(id); result.push(node);
  }
  ids.forEach(visit);
  return result;
}
export function suggestKnowledge(text, subject, knowledge) {
  const normalized = text.toLowerCase();
  return knowledge.filter(k => k.subject === subject && (k.keywords || [k.name]).some(word => normalized.includes(word.toLowerCase()))).map(k => k.id);
}
export function selectPaper(state, { strategy = 'due', count = 6, subject = '全部', ids = [] } = {}, random = Math.random) {
  const stats = knowledgeStats(state);
  const rates = new Map(stats.map(k => [k.id, k.rate]));
  let pool = activeRecords(state).filter(r => subject === '全部' || r.subject === subject);
  if (strategy === 'manual') return pool.filter(r => ids.includes(r.id));
  if (strategy === 'due') pool.sort((a,b) => (a.nextReview || '9999').localeCompare(b.nextReview || '9999') || a.stage-b.stage);
  if (strategy === 'weak') {
    const strength = r => r.knowledgeIds.length ? Math.min(...r.knowledgeIds.map(id => rates.get(id) || 0)) : 0;
    pool.sort((a,b) => strength(a)-strength(b) || a.stage-b.stage);
  }
  if (strategy === 'frequent') {
    const frequencies = Object.fromEntries(REASONS.map(reason => [reason, pool.filter(r => r.reason === reason).length]));
    pool.sort((a,b) => (frequencies[b.reason]||0)-(frequencies[a.reason]||0) || a.stage-b.stage);
  }
  if (strategy === 'random') {
    for (let i = pool.length-1; i > 0; i--) { const j = Math.floor(random()*(i+1)); [pool[i],pool[j]] = [pool[j],pool[i]]; }
  }
  return pool.slice(0, Math.max(1, Math.min(30, Number(count)||6)));
}
const k = (id, name, subject, prerequisites, keywords, explanation, example, exercise, answer, solution) => ({id,name,subject,prerequisites,keywords,explanation,example,exercise,answer,solution,builtin:true});
export function builtInKnowledge() {
 return [
  k('math-equation','一元一次方程','数学',[],['一元一次','移项','解方程','方程'], '等式两边同时加减同一个数，或乘除同一个非零数，等式仍然成立。解方程时先去分母、去括号，再移项、合并同类项，最后将系数化为 1。','3x − 6 = 9 → 3x = 15 → x = 5。移项时要改变符号。','解方程：3(x − 2) = 2x + 5。','x = 11','去括号得 3x − 6 = 2x + 5；移项并合并同类项得 x = 11。代回两边都是 27。'),
  k('math-factor','因式分解','数学',['math-equation'],['因式分解','平方差','完全平方','x²','二次方程'], '将一个多项式写成几个整式乘积的形式。先提取公因式，再检查平方差 a² − b² = (a+b)(a−b) 或完全平方 a² ± 2ab + b² = (a±b)²。','x² − 5x + 6 = (x−2)(x−3)。找乘积为 6、和为 −5 的两个数。','将 x² − 7x + 12 因式分解，并求 x² − 7x + 12 = 0 的解。','(x − 3)(x − 4)；x = 3 或 x = 4','−3 与 −4 的积为 12、和为 −7，因此分解为 (x−3)(x−4)。乘积为 0，则至少有一个因式为 0。'),
  k('math-quadratic','二次函数','数学',['math-factor'],['抛物线','二次函数','顶点','对称轴','y=x','y = x'], '一般式 y = ax² + bx + c（a ≠ 0），对称轴为 x = −b/(2a)。配方成 y = a(x−h)²+k 可直接读出顶点 (h,k)。a 的正负决定开口方向。','y = x² − 4x + 3 = (x−2)² − 1，所以顶点为 (2,−1)，最小值为 −1。','求 y = x² − 6x + 5 的顶点坐标，以及函数的最小值。','顶点为 (3, −4)，最小值为 −4','配方：y = (x−3)²−4。因为平方项非负，且 a=1>0，所以 x=3 时 y 取得最小值 −4。'),
  k('math-geometry','相似三角形','数学',[],['相似','三角形','对应边','比例'], '判定相似可用：两角对应相等、两边成比例且夹角相等、三边对应成比例。相似图形的周长比等于相似比，面积比等于相似比的平方。','两个相似三角形的对应边比为 2:3，则面积比为 4:9。','两个相似三角形对应边长分别为 4 cm 和 6 cm。较小三角形面积为 12 cm²，求较大三角形面积。','27 cm²','相似比为 4:6=2:3，面积比为 4:9，较大面积为 12×9/4=27 cm²。'),
  k('physics-force','受力分析','物理',[],['受力','摩擦','重力','支持力','牛顿'], '先确定研究对象，画出所有外力，再选择坐标方向。接触不一定存在摩擦，摩擦方向与接触面间相对运动或相对运动趋势相反。匀速直线运动时合力为 0。','物块在水平面匀速运动：竖直方向 N=mg，水平方向 F=f。','质量 2 kg 的物块在水平桌面上以 3 m/s 匀速运动，受到水平拉力 4 N。求摩擦力大小与合力。','摩擦力为 4 N；合力为 0 N','匀速直线运动意味着合力为零，水平方向拉力与摩擦力平衡，大小相等、方向相反。速度数值不参与计算。'),
  k('physics-ohm','欧姆定律','物理',[],['电阻','电流','电压','欧姆','串联','并联'], '在温度等条件不变时，电流 I 与电压 U 成正比，与电阻 R 成反比：I=U/R。串联电路电流相等、总电压相加；并联电路电压相等、总电流相加。','6 V 电源连接 3 Ω 电阻，电流为 6/3=2 A。','6 Ω 与 3 Ω 两电阻并联在 6 V 电源两端，求干路电流。','3 A','两支路电压均为 6 V。I₁=6/6=1 A，I₂=6/3=2 A；干路电流 I=I₁+I₂=3 A。'),
  k('physics-energy','功与机械能','物理',['physics-force'],['机械能','动能','势能','做功','功率'], '功 W=Fs（力与位移同向时），功率 P=W/t。动能随质量与速度增加而增大；重力势能取决于质量和高度。仅有重力做功时机械能守恒。','10 N 的力沿水平方向推动物体 2 m，做功为 20 J。','用 20 N 的水平力将物体沿力方向推行 3 m，用时 5 s，求做功和平均功率。','W = 60 J，P = 12 W','W=Fs=20×3=60 J；P=W/t=60/5=12 W。注意力和位移必须在同一方向。'),
  k('english-tense','现在完成时','英语',[],['have','has','since','for ','完成时','过去式'], '结构为 have/has + 过去分词。强调过去动作对现在的影响，或从过去持续到现在的状态。since 后接时间起点，for 后接时间段；持续性语境需使用延续性动词。','She has lived here since 2020. / for six years.','填空：He ___ (live) in Shanghai since 2021.','has lived','since 2021 表示从过去到现在的持续状态，应使用现在完成时。主语 He 为第三人称单数，助动词用 has。'),
  k('english-relative','定语从句','英语',[],['定语从句','which','who','that','whose'], '定语从句修饰名词或代词。关系词既连接从句，也在从句中作成分。先判断先行词指人还是物，再判断从句缺少主语、宾语还是定语。','The book that I bought is useful. 先行词 book 指物，that 在从句中作宾语。','选择关系词：The girl ___ father is a doctor is my classmate.','whose','从句中 father 前缺少表示所属关系的定语，whose father 意为“她的父亲”。who 与 that 不能直接表达这种所属关系。'),
  k('chemistry-mass','质量守恒定律','化学',[],['质量守恒','配平','化学方程式','反应'], '化学反应前后原子的种类、数目不变，因而反应物总质量与生成物总质量相等。配平时只能调整化学式前的系数，不能改变下标。','2H₂ + O₂ → 2H₂O。两边氢原子均为 4 个，氧原子均为 2 个。','配平：__ Fe + __ O₂ → __ Fe₃O₄。','3 Fe + 2 O₂ → Fe₃O₄','以 Fe₃O₄ 为基准，右侧含 3 个 Fe、4 个 O，左侧需要 3 Fe 和 2 O₂。系数为 3:2:1。'),
  k('chemistry-solution','溶液质量分数','化学',['chemistry-mass'],['溶液','质量分数','溶质','稀释'], '溶质质量分数 = 溶质质量 / 溶液质量 × 100%。溶液质量包含溶质与溶剂。稀释时若无反应、无损失，溶质质量保持不变。','10 g 盐溶于 90 g 水，质量分数为 10/(10+90)=10%。','将 50 g、质量分数为 20% 的盐水加水稀释至 10%，应加水多少克？','50 g','原溶质质量为 50×20%=10 g。稀释后溶液质量为 10/10%=100 g，因此加水质量为 100−50=50 g。'),
  k('biology-cell','细胞的结构与功能','生物',[],['细胞','细胞膜','细胞核','细胞壁','液泡'], '细胞膜控制物质进出，细胞质是多种生命活动进行的场所，细胞核含有遗传物质。植物细胞通常有细胞壁，成熟植物细胞常有大液泡；绿色部位的细胞可含叶绿体，不能据此认为所有植物细胞都有叶绿体。','细胞壁主要起支持和保护作用，控制物质进出的主要结构是细胞膜。','植物细胞中，主要控制物质进出的结构是什么？它与细胞壁的主要功能有何不同？','细胞膜；细胞壁主要起支持和保护作用。','细胞膜具有选择透过性，能够调节物质进出；细胞壁的主要作用是支持和保护，不能把二者的功能混淆。'),
  k('biology-photosynthesis','光合作用','生物',['biology-cell'],['光合作用','叶绿体','叶绿素','淀粉','遮光'], '绿色植物在光照下，利用叶绿体将二氧化碳和水合成有机物并释放氧气，把光能转化为储存在有机物中的化学能。区分原料、产物、条件与场所；光是条件，叶绿体是主要场所。','检测叶片中的淀粉时，先用酒精脱去叶绿素，再滴加碘液；含淀粉的部分变蓝。','植物先经充分暗处理，再将同一叶片的一部分遮光，光照一段时间后脱色并滴加碘液。遮光与未遮光部分的颜色有何不同？','未遮光部分变蓝；遮光部分不变蓝。','充分暗处理先消耗原有淀粉。光照后，未遮光部分通过光合作用产生淀粉，遇碘变蓝；遮光部分缺少光照，不产生相应淀粉。'),
  k('biology-respiration','植物的呼吸作用','生物',['biology-cell'],['呼吸作用','有氧呼吸','萌发','种子','二氧化碳'], '植物的有氧呼吸利用氧气分解有机物，生成二氧化碳和水并释放能量。活细胞白天、夜晚都进行呼吸作用；光照不是呼吸作用的必要条件，不要把呼吸作用与光合作用混为一谈。','萌发种子的呼吸作用较旺盛，释放的热量可使实验装置中的温度升高。','在供氧充足的条件下，萌发种子使装置温度升高，排出的气体使澄清石灰水变浑浊。这分别说明了什么？','呼吸作用释放能量，并产生二氧化碳。','温度升高说明一部分能量以热的形式释放；石灰水变浑浊是二氧化碳的检验现象。实验现象应分别对应结论。'),
  k('chinese-rhetoric','修辞手法','语文',[],['修辞','比喻','拟人','排比','夸张'], '判断修辞先看表达关系，而不是只找关键词。比喻通常用不同类事物之间的相似点作比较；拟人把事物当作人来写；赏析时还要说明其在具体语境中的表达效果。','“弯弯的月亮像一只小船”是比喻；“他好像刚睡醒”中的“好像”表示推测，不能仅凭这个词判定为比喻。','判断哪句使用了比喻，并说明理由：A. 他好像刚睡醒。 B. 弯弯的月亮像一只小船。 C. 她像姐姐一样高。','B。把月亮比作小船，突出二者弯曲形状的相似。','B 的本体是月亮、喻体是小船，属于不同类事物的相似比较。A 表示推测，C 是同类人物之间的比较，均不构成这里所说的比喻。'),
  k('chinese-reading','现代文阅读','语文',['chinese-rhetoric'],['现代文','阅读','概括','人物特点','描写','赏析'], '先审清题目的对象和范围，再在原文中寻找依据，最后分要点作答。概括人物特点要结合语言、动作等具体描写；赏析句子可从表达方式、内容及情感效果展开，避免脱离文本套用结论。','“他把伞往同伴那边挪了挪，自己半边肩膀湿透了”可作为关心同伴的动作依据。','阅读：“雨越下越急，他把伞往同伴那边挪了挪，自己半边肩膀湿透了。”概括人物特点，并写出依据。','他关心、体贴同伴；依据是把伞移向同伴，自己却被雨淋湿。','先找动作“把伞往同伴那边挪”，再结合结果“自己半边肩膀湿透”，由行为与结果概括体贴他人的特点。答案应同时包含特点和文本依据。'),
  k('chinese-classical','文言文阅读','语文',[],['文言文','文言','实词','虚词','翻译','句式','学而时习之'], '结合上下文判断词义、指代与句式，再进行翻译。翻译时保留必要的人名地名，落实关键词，按现代汉语习惯调整语序并补足省略成分，不机械地用某个常见义替代全部语境。','“学而时习之”中的“之”是代词，指所学的内容。','“学而时习之”中的“之”指代什么？翻译时为什么不能把它直接解释成“的”？','指代所学的知识或内容；这里的“之”是代词，不是表示修饰关系的结构助词。','先分析语境和语法位置：“习”后需要指代所学内容的成分，因此“之”指所学的内容。文言虚词有不同用法，不能只套用一个固定释义。')
 ];
}
export function createInitialState(withDemo = true, date = today()) {
 const knowledge = builtInKnowledge();
 const state = { version: VERSION, knowledgeLibraryVersion: KNOWLEDGE_LIBRARY_VERSION, records: [], knowledge, logs: [], prefs: { dailyGoal: 6, name: '我的学习空间' } };
 if (!withDemo) return state;
 const examples = [
  ['二次函数的顶点与最值','数学','已知二次函数 y = x² − 4x + 3，求抛物线的顶点坐标及函数最小值。','顶点为 (−2, −1)，最小值为 −1。','顶点为 (2, −1)，最小值为 −1。','配方得到 y = (x−2)²−1；括号内为 x−2，对应顶点横坐标为 2。不要把括号内的符号直接作为坐标。','概念不清',['math-quadratic'], '八年级数学 · 第六章单元练习'],
  ['并联电路中的电流分配','物理','电阻 R₁ = 6 Ω、R₂ = 3 Ω，并联接在 6 V 电源两端。求干路电流。','I = 6 ÷ (6 + 3) ≈ 0.67 A','I = 3 A','并联时各支路电压相等。I₁ = 6/6 = 1 A，I₂ = 6/3 = 2 A，干路电流为 3 A。错误来自把并联当作串联。','方法不当',['physics-ohm'],'物理周测 · 第 12 题'],
  ['since 与现在完成时','英语','用所给词的适当形式填空：She ___ (work) here since 2020.','worked','has worked','since 引导时间起点，表示动作从过去持续至今，应使用 have/has + 过去分词。主语 She 对应 has。','知识遗忘',['english-tense'],'英语同步练习 · Unit 4'],
  ['相似三角形的面积比','数学','△ABC 与 △DEF 相似，对应边长之比为 2:3。若 △ABC 的面积为 16 cm²，求 △DEF 的面积。','24 cm²','36 cm²','面积比是相似比的平方，即 4:9，因此面积为 16×9/4=36 cm²。','概念不清',['math-geometry'],'期中复习 · 几何专题'],
  ['一元二次方程的因式分解','数学','解方程：x² − 5x + 6 = 0。','x = 2','x = 2 或 x = 3','因式分解为 (x−2)(x−3)=0。两个因式任意一个为 0 都成立，不能遗漏第二个解。','推理不严',['math-factor'],'数学练习册 · 第 36 页'],
  ['匀速运动时的受力平衡','物理','一个物体在水平面上受到 8 N 拉力而做匀速直线运动。求物体所受摩擦力和合力。','摩擦力小于 8 N，合力向前。','摩擦力为 8 N，合力为 0 N。','匀速直线运动意味着受力平衡。物体运动不代表存在向前的合力。','概念不清',['physics-force'],'物理课堂练习'],
  ['含括号的一元一次方程','数学','解方程：2(x − 3) = x + 4。','x = 7','x = 10','去括号：2x−6=x+4；移项：x=10。去括号时要将系数乘到每一项。','计算失误',['math-equation'],'基础巩固 · 第 8 题'],
  ['溶液稀释的质量计算','化学','把 100 g、质量分数为 20% 的盐水稀释到 10%，需要加入多少克水？','100×10% = 10 g','100 g','溶质不变，为 20 g。稀释后溶液总质量为 20/10%=200 g，所以加水 100 g。','审题遗漏',['chemistry-solution'],'化学单元测评'],
  ['定语从句关系词的选择','英语','The boy ___ mother is a teacher is my friend. 请选择正确的关系词。','who','whose','从句中 mother 前缺表示所属关系的定语，应用 whose。先分析关系词在从句中的成分。','方法不当',['english-relative'],'英语语法专项训练'],
  ['化学方程式的配平','化学','配平下列方程式：Fe + O₂ → Fe₃O₄。','Fe + 2O₂ → Fe₃O₄','3Fe + 2O₂ → Fe₃O₄','产物含 3 个铁原子、4 个氧原子。反应物分别取 3Fe 和 2O₂，保证原子个数守恒。','审题遗漏',['chemistry-mass'],'化学课堂笔记'],
  ['功率的单位换算','物理','水平拉力 40 N 将物体沿力方向匀速移动 5 m，历时 20 s，求平均功率。','P = 200 W','P = 10 W','先求功 W=Fs=40×5=200 J，再除以时间 20 s，得功率 10 W。功和功率不可混用。','表达不规范',['physics-energy'],'物理作业 · 功与功率'],
  ['配方法求二次函数最值','数学','求函数 y = x² + 2x − 3 的最小值，以及取得最小值时的 x。','最小值 −3，x = 0','最小值 −4，x = −1','配方为 y=(x+1)²−4。平方项最小为 0，因此 x=−1 时最小值为 −4。','时间不足',['math-quadratic'],'期中模拟卷 · 第 18 题']
 ];
 state.records=examples.map((e,i) => ({ id:`demo-${i+1}`,title:e[0],subject:e[1],content:e[2],wrong:e[3],answer:e[4],analysis:e[5],reason:e[6],knowledgeIds:e[7],source:e[8],difficulty:i%3+1,type:i%2?'填空题':'解答题',createdAt:addDays(date,-(i+1)),updatedAt:date,nextReview:addDays(date,i<5 ? -Math.floor(i/3) : i<9 ? 1+(i%3) : 4),status:i>=9?'mastered':i%3===0?'new':'reviewing',stage:i>=9?2:i%2,archived:false,starred:i===0||i===3,photo:'',demo:true }));
 const counts=[3,5,2,4,3,6,2];
 for(let day=6;day>=0;day--) for(let j=0;j<counts[6-day];j++) state.logs.push({id:`demo-log-${day}-${j}`,date:addDays(date,-day),recordId:`demo-${(j%12)+1}`,mastered:(j+day)%3!==0,stage:1,demo:true});
 return state;
}
const dateOK = d => typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d) && !Number.isNaN(Date.parse(`${d}T12:00:00Z`)) && new Date(`${d}T12:00:00Z`).toISOString().slice(0,10) === d;
const str = (s,max=30000) => typeof s === 'string' ? s.slice(0,max) : '';
export function sanitizeAISource(input) {
 if(!input||!str(input.model,160))return null;
 return {model:str(input.model,160),provider:str(input.provider,40),label:str(input.label,80),generatedAt:str(input.generatedAt,40),reviewed:!!input.reviewed};
}
export function sanitizeOCRSource(input) {
 if(!input||!['local','vision'].includes(input.engine))return null;
 return {engine:input.engine,model:str(input.model,160),confidence:Number.isFinite(input.confidence)?Math.max(0,Math.min(100,input.confidence)):null,recognizedAt:str(input.recognizedAt,40)};
}
export function sanitizeCaptureSource(input) {
 if(!input||input.channel!=='chatgpt')return null;
 return {channel:'chatgpt',capturedAt:str(input.capturedAt,40),needsReview:!!input.needsReview};
}
export function validateState(input) {
 if (!input || input.version !== VERSION || !Array.isArray(input.records) || !Array.isArray(input.knowledge) || !Array.isArray(input.logs)) throw new Error('不是有效的知错备份文件，或版本暂不兼容');
 if(input.records.length>3000 || input.knowledge.length>500 || input.logs.length>100000) throw new Error('备份数据量超出本地版本上限');
 const knowledge=input.knowledge.map(k => {
  if (!k || !str(k.id,100) || !str(k.name,80)) throw new Error('知识点数据不完整');
  return {id:str(k.id,100),name:str(k.name,80),subject:SUBJECTS.includes(k.subject)?k.subject:'其他',prerequisites:Array.isArray(k.prerequisites)?k.prerequisites.map(x=>str(x,100)).filter(Boolean):[],keywords:Array.isArray(k.keywords)?k.keywords.map(x=>str(x,80)).filter(Boolean):[],explanation:str(k.explanation),example:str(k.example),exercise:str(k.exercise),answer:str(k.answer),solution:str(k.solution),builtin:!!k.builtin};
 });
 const ids = new Set(knowledge.map(k=>k.id));
 if(ids.size!==knowledge.length) throw new Error('知识点编号重复');
 knowledge.forEach(k=>{if(k.prerequisites.some(id=>!ids.has(id))) throw new Error('知识点前置关系不完整');});
 learningPath(knowledge,[...ids]);
 // Upgrade the two new subject libraries once, preserving edited/user-created nodes and record IDs.
 if((Number(input.knowledgeLibraryVersion)||1)<KNOWLEDGE_LIBRARY_VERSION){
  const additions=builtInKnowledge().filter(k=>['生物','语文'].includes(k.subject));
  const aliases=new Map(),appended=[];
  for(const node of additions){
   const existing=knowledge.find(k=>k.id===node.id||(k.subject===node.subject&&k.name===node.name));
   if(existing){aliases.set(node.id,existing.id);continue;}
   if(knowledge.length>=500)continue;
   const copy={...node,prerequisites:[]};knowledge.push(copy);ids.add(copy.id);aliases.set(node.id,copy.id);appended.push([copy,node.prerequisites]);
  }
  for(const [copy,prerequisites] of appended)copy.prerequisites=prerequisites.map(id=>aliases.get(id)).filter(Boolean);
  learningPath(knowledge,[...ids]);
 }
 const records=input.records.map(r=>{
  if(!r || !str(r.id,100)||!str(r.title,160)||!dateOK(r.createdAt) || (r.reason!==null&&!REASONS.includes(r.reason))) throw new Error('错题数据不完整或错因不属于固定分类');
  if(r.nextReview && !dateOK(r.nextReview)) throw new Error('复习日期无效');
  return {id:str(r.id,100),title:str(r.title,160),content:str(r.content),subject:SUBJECTS.includes(r.subject)?r.subject:'其他',wrong:str(r.wrong),answer:str(r.answer),analysis:str(r.analysis),source:str(r.source,200),reason:r.reason,knowledgeIds:Array.isArray(r.knowledgeIds)?r.knowledgeIds.filter(id=>ids.has(id)):[],difficulty:[1,2,3].includes(r.difficulty)?r.difficulty:2,type:['选择题','填空题','解答题'].includes(r.type)?r.type:'解答题',createdAt:r.createdAt,updatedAt:dateOK(r.updatedAt)?r.updatedAt:r.createdAt,nextReview:r.nextReview||null,lastReviewed:dateOK(r.lastReviewed)?r.lastReviewed:null,status:['new','reviewing','mastered'].includes(r.status)?r.status:'new',stage:Number.isInteger(r.stage)?Math.max(0,Math.min(4,r.stage)):0,photo:typeof r.photo==='string'&&/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(r.photo)&&r.photo.length<2100000?r.photo:'',archived:!!r.archived,starred:!!r.starred,demo:!!r.demo};
 });
 records.forEach((r,i)=>{r.aiSource=sanitizeAISource(input.records[i].aiSource);r.ocrSource=sanitizeOCRSource(input.records[i].ocrSource);r.captureSource=sanitizeCaptureSource(input.records[i].captureSource);if(typeof input.records[i].photo==='string'&&/^\/api\/files\/photo-[a-f0-9]{64}$/.test(input.records[i].photo))r.photo=input.records[i].photo;});
 const rids = new Set(records.map(r=>r.id));
 if(rids.size!==records.length) throw new Error('错题编号重复');
 const logs=input.logs.filter(l=>l&&rids.has(l.recordId)&&dateOK(l.date)).map(l=>({id:str(l.id,100)||uid(),recordId:l.recordId,date:l.date,mastered:!!l.mastered,stage:Math.max(0,Math.min(4,Number(l.stage)||0)),demo:!!l.demo}));
 return {version:VERSION,knowledgeLibraryVersion:KNOWLEDGE_LIBRARY_VERSION,records,knowledge,logs,prefs:{name:str(input.prefs?.name,30)||'我的学习空间',dailyGoal:Math.max(1,Math.min(50,Number(input.prefs?.dailyGoal)||6))}};
}
