-- Phase 58: Add company descriptions to stocks table
-- Adds description_ar and description_en columns + seeds real Arabic descriptions
-- for all 10 active Tadawul stocks. Idempotent via IF NOT EXISTS on columns;
-- UPDATEs overwrite any existing description_ar values on re-run (intentional --
-- this is the canonical seed source).

-- Add description columns to stocks table
ALTER TABLE stocks ADD COLUMN IF NOT EXISTS description_ar TEXT;
ALTER TABLE stocks ADD COLUMN IF NOT EXISTS description_en TEXT;

-- Seed Arabic descriptions for all 10 active Tadawul stocks

UPDATE stocks
SET description_ar = 'شركة الزيت العربية السعودية (أرامكو) هي أكبر شركة نفط متكاملة في العالم من حيث الإنتاج والاحتياطيات المؤكدة. تأسست عام ١٩٣٣ ومقرها الظهران، وتوفر النفط الخام والغاز الطبيعي والمنتجات البتروكيماوية لأسواق العالم، وتلعب دوراً محورياً في الاقتصاد السعودي.'
WHERE symbol = '2222';

UPDATE stocks
SET description_ar = 'أكبر بنك إسلامي في العالم من حيث القيمة السوقية، تأسس عام ١٩٥٧ ومقره الرياض. يقدم خدمات مصرفية متكاملة للأفراد والشركات وفق أحكام الشريعة الإسلامية، ويمتلك شبكة فروع واسعة ومحفظة تمويلية من الأكبر في المنطقة.'
WHERE symbol = '1120';

UPDATE stocks
SET description_ar = 'شركة التعدين العربية السعودية، الرائدة في قطاع التعدين بالمملكة. تنتج الذهب والفوسفات والألومنيوم والنحاس، وتُعدّ ركيزة أساسية لاستراتيجية التنويع الاقتصادي ضمن رؤية المملكة ٢٠٣٠.'
WHERE symbol = '1211';

UPDATE stocks
SET description_ar = 'أكبر بنك في المملكة العربية السعودية من حيث الأصول، نتج عن اندماج البنك الأهلي التجاري مع مجموعة سامبا المالية عام ٢٠٢١. يقدم خدمات مصرفية شاملة للأفراد والشركات والجهات الحكومية، ويمتلك حضوراً إقليمياً قوياً.'
WHERE symbol = '1180';

UPDATE stocks
SET description_ar = 'شركة الاتصالات السعودية (stc) هي المشغل الرائد لخدمات الاتصالات في المنطقة. تقدم خدمات الجوال والإنترنت والحلول الرقمية والترفيه الرقمي، ولها حضور توسعي في عدة دول بالشرق الأوسط وشمال أفريقيا.'
WHERE symbol = '7010';

UPDATE stocks
SET description_ar = 'الشركة السعودية للصناعات الأساسية، إحدى أكبر شركات البتروكيماويات في العالم. تنتج المواد البلاستيكية والأسمدة والكيماويات المتخصصة والمعادن، وتوزع منتجاتها على أكثر من ١٤٠ دولة حول العالم.'
WHERE symbol = '2010';

UPDATE stocks
SET description_ar = 'شركة سعودية رائدة في تطوير وتشغيل محطات توليد الكهرباء ومحطات تحلية المياه. تدير مشاريع في أكثر من ١٢ دولة، وتركز على الطاقة النظيفة والمتجددة كجزء من تحولات قطاع الطاقة ضمن رؤية المملكة ٢٠٣٠.'
WHERE symbol = '2082';

UPDATE stocks
SET description_ar = 'أحد أقدم البنوك السعودية وأكبرها، تأسس عام ١٩٥٧. يقدم خدمات مصرفية متكاملة للأفراد والشركات، ويتميز بخدماته في تمويل المشاريع الكبرى والخدمات الاستثمارية والتجزئة المصرفية.'
WHERE symbol = '1010';

UPDATE stocks
SET description_ar = 'مجموعة الدكتور سليمان الحبيب الطبية، أكبر مقدّم للرعاية الصحية في القطاع الخاص بالمملكة. تدير شبكة واسعة من المستشفيات والمراكز الطبية المتخصصة في المملكة ودول الخليج، وتشتهر بمستوى خدماتها الطبية المتطورة.'
WHERE symbol = '4013';

UPDATE stocks
SET description_ar = 'البنك الأول (SABB) أحد أكبر البنوك التجارية في المملكة، نتج عن اندماج ساب مع بنك الأول عام ٢٠١٩. يقدم خدمات مصرفية شاملة للأفراد والشركات، ويتميز بخبرته في التجارة الدولية وخدمات الثروات.'
WHERE symbol = '1060';

-- Verify: SELECT symbol, LEFT(description_ar, 50) AS desc_preview FROM stocks WHERE is_active = true ORDER BY symbol;
