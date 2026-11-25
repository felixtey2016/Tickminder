import {checkQuiz,type QuizContent,type QuizKey} from './quiz';
// Original short exercises authored for Tickminder. No past-paper text or images.
const items:[string,string,string,string[]][]=[
 ['计算 −9 + 14。','Calculate −9 + 14.','5',['−5','23','−23']],
 ['计算 3/4 + 1/8。','Calculate 3/4 + 1/8.','7/8',['4/12','1/2','5/8']],
 ['把 0.35 写成百分数。','Express 0.35 as a percentage.','35%',['3.5%','0.35%','350%']],
 ['求 250 的 18%。','Find 18% of 250.','45',['18','40','50']],
 ['两数之比为 2:3，总和为 75。较小的数是多少？','Two numbers are in the ratio 2:3 and sum to 75. Find the smaller number.','30',['25','45','15']],
 ['把二进制数 1011₂ 换成十进制数。','Convert the binary number 1011₂ to base ten.','11',['9','10','13']],
 ['把十进制数 64 换成二进制数。','Convert 64 in base ten to binary.','1000000₂',['100000₂','1000010₂','1100000₂']],
 ['计算 2³ × 2²。','Calculate 2³ × 2².','32',['16','64','10']],
 ['求 144 的正平方根。','Find the positive square root of 144.','12',['14','72','24']],
 ['计算 (−3)²。','Calculate (−3)².','9',['−9','6','−6']],
 ['解方程 3x + 5 = 26。','Solve 3x + 5 = 26.','x = 7',['x = 6','x = 9','x = 21']],
 ['解方程 2(x − 4) = 10。','Solve 2(x − 4) = 10.','x = 9',['x = 7','x = 1','x = 14']],
 ['求经过 (1,3) 和 (5,11) 的直线的斜率。','Find the gradient of the line through (1,3) and (5,11).','2',['1/2','4','8']],
 ['若 y = 3x − 2，当 x = 4 时，y 是多少？','If y = 3x − 2, find y when x = 4.','10',['14','6','8']],
 ['展开 (x + 3)(x − 2)。','Expand (x + 3)(x − 2).','x² + x − 6',['x² − x − 6','x² + 5x − 6','x² + x + 6']],
 ['把 x² − 25 分解因式。','Factorise x² − 25.','(x − 5)(x + 5)',['(x − 5)²','(x − 25)(x + 1)','(x + 5)²']],
 ['若 a = 4，b = −2，计算 2a − 3b。','If a = 4 and b = −2, calculate 2a − 3b.','14',['2','−14','10']],
 ['数列 3, 7, 11, … 的下一项是什么？','What is the next term in 3, 7, 11, …?','15',['13','14','16']],
 ['若 x + y = 9 且 x − y = 3，求 x。','If x + y = 9 and x − y = 3, find x.','6',['3','4','12']],
 ['解不等式 2x + 1 < 9。','Solve 2x + 1 < 9.','x < 4',['x > 4','x < 5','x > 5']],
 ['三角形的两个内角分别为 55° 和 65°，求第三个内角。','Two angles of a triangle are 55° and 65°. Find the third angle.','60°',['50°','70°','120°']],
 ['长方形的长为 9 cm，宽为 4 cm，求面积。','A rectangle is 9 cm long and 4 cm wide. Find its area.','36 cm²',['26 cm²','18 cm²','13 cm²']],
 ['三角形的底为 12 cm，高为 7 cm，求面积。','A triangle has base 12 cm and height 7 cm. Find its area.','42 cm²',['84 cm²','19 cm²','38 cm²']],
 ['圆的半径为 7 cm，取 π = 22/7，求周长。','A circle has radius 7 cm. Using π = 22/7, find its circumference.','44 cm',['22 cm','154 cm','49 cm']],
 ['长方体的三条边长为 2 cm、3 cm 和 5 cm，求体积。','A cuboid has dimensions 2 cm, 3 cm and 5 cm. Find its volume.','30 cm³',['10 cm³','31 cm³','60 cm³']],
 ['求五边形的内角和。','Find the sum of the interior angles of a pentagon.','540°',['360°','720°','900°']],
 ['直角三角形的两条直角边为 6 cm 和 8 cm，求斜边。','The perpendicular sides of a right triangle are 6 cm and 8 cm. Find its hypotenuse.','10 cm',['14 cm','12 cm','7 cm']],
 ['一幅图以比例 1:50 绘制。图上 4 cm 代表实际多少米？','A drawing uses a scale of 1:50. How many metres does 4 cm represent?','2 m',['0.2 m','20 m','200 m']],
 ['把 2.5 小时换成分钟。','Convert 2.5 hours to minutes.','150',['125','120','250']],
 ['一辆车以 60 km/h 行驶 1.5 小时，行驶了多远？','A car travels at 60 km/h for 1.5 hours. Find the distance.','90 km',['40 km','60 km','120 km']],
 ['求 4、6、8 的平均数。','Find the mean of 4, 6 and 8.','6',['5','7','18']],
 ['求 2、5、7、9、12 的中位数。','Find the median of 2, 5, 7, 9 and 12.','7',['5','9','6']],
 ['求 3、4、4、6、8 的众数。','Find the mode of 3, 4, 4, 6 and 8.','4',['3','6','8']],
 ['求 5、11、14、20 的极差。','Find the range of 5, 11, 14 and 20.','15',['14','20','25']],
 ['掷一颗公平六面骰子，得到偶数的概率是多少？','A fair six-sided die is rolled. What is the probability of an even number?','1/2',['1/3','1/6','2/3']],
 ['袋中有 3 个红球和 7 个蓝球。随机取一个，取到红球的概率是多少？','A bag contains 3 red and 7 blue balls. Find the probability of drawing a red ball.','3/10',['3/7','7/10','1/3']],
 ['商品原价 RM80，折扣 15%，售价是多少？','An item costs RM80 before a 15% discount. Find its sale price.','RM68',['RM65','RM72','RM12']],
 ['本金 RM1000，年单利率 5%，存 2 年的利息是多少？','Find the simple interest on RM1000 at 5% per year for 2 years.','RM100',['RM50','RM110','RM200']],
 ['把 0.00045 写成标准形式。','Express 0.00045 in standard form.','4.5 × 10⁻⁴',['4.5 × 10⁻³','45 × 10⁻⁴','4.5 × 10⁴']],
 ['若集合 A = {1,2,3}，B = {3,4}，求 A ∩ B。','If A = {1,2,3} and B = {3,4}, find A ∩ B.','{3}',['{1,2,3,4}','{1,2}','{4}']],
];
export function originalQuizSeed(){
 const questions=items.map(([zh,en,answer,distractors],index)=>{const id='original-spm-foundations-'+(index+1),texts=[answer,...distractors],rotation=index%4;const options=texts.map((_,i)=>({id:id+'-o'+i,text:{primary:texts[(i+rotation)%4],en:texts[(i+rotation)%4]},imageId:null}));return{id,type:'mcq' as const,prompt:{primary:zh,en},imageId:null,extraImageIds:[],options,points:1,difficulty:'medium' as const,sourceId:'Tickminder Original 2026 '+(index+1),chapter:'',level:''};});
 const keys:QuizKey[]=questions.map((q,index)=>({questionId:q.id,mode:'choice',correctOptionId:q.options.find(o=>o.text.primary===items[index][2])!.id,accepted:[],caseSensitive:false,tolerance:0,unit:'',rubric:'',explanation:items[index][1]+' Answer: '+items[index][2]}));
 const content:QuizContent={schemaVersion:1,title:'SPM Mathematics · Original Foundations Set 1',instructions:'原创基础综合练习，共40题。Original foundation exercises, 40 questions. Review the draft before publication.',subject:'Mathematics',subjectId:'mathematics',exam:'SPM',syllabusId:'spm',year:null,region:'Tickminder Original',paper:'Original Foundations 1',difficulty:'medium',primaryLanguage:'zh',timeLimitSeconds:null,shuffleQuestions:false,shuffleOptions:true,questions,bankKind:'platform',catalog:{kind:'level_overall',level:'Form 5',chapterCode:'',chapterTitle:'',subtopicCode:'',subtopicTitle:'',setNumber:1}};
 return checkQuiz(content,keys);
}
