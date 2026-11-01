<!-- qawa:generated v1 skills=brainstorming,diagnosing-superpowers,executing-plans,finishing-a-development-branch,receiving-code-review,requesting-code-review,systematic-debugging,test-driven-development,using-git-worktrees,using-superpowers,verification-before-completion,writing-plans,writing-skills -->

# qawa — الموجّه (اقرأه، ثم حمّل المهارة المطلوبة فقط)

> بديل أداة `Skill`. لا تقرأ كل المهارات — اقرأ هذا الملف، ثم ملف المهارة الواحدة
> التي تنطبق. كل المهارات معاً ≈ 29 ألف توكن؛ هذا الملف ≈ 1.4 ألف.

## ترتيب الأولوية

عند التعارض، هذا هو الترتيب — ولا تتجاوزه مهارة:

1. تعليمات المستخدم الصريحة
2. قيود بيئة التنفيذ (لا subagent، لا Skill tool، لا شبكة)
3. المهارة المنطبقة
4. حكمك الهندسي

## القاعدة (غير قابلة للتفاوض)

**قبل أي إجراء** — بما فيه أسئلة التوضيح وقراءة الملفات — طابق الطلب مع
الجدول أدناه واقرأ ملف المهارة.
إن انطبقت مهارة **فعلاً**، فهي التزام ما دامت منطبقة — ثم قل:
«استخدام مهارة X من أجل Y».

لا تُخضع لمهارة: طلباً لا علاقة له بها، أو تغييراً أصغر من دورتها، أو
أمراً صريحاً من المستخدم يعارضها.

## الوضع (MODE)

| | `FAST` (تغيير بسيط، نموذج، سكربت) | `FULL` (ميزة، مشروع، repo فريق) |
|---|---|---|
| 1 | — | `brainstorming` ← مستند تصميم |
| 2 | — | `using-git-worktrees` |
| 3 | — | `writing-plans` ← خطة مهام |
| 4 | `test-driven-development` | `executing-plans` + `test-driven-development` |
| 5 | `verification-before-completion` | `requesting-code-review` ثم `verification-before-completion` |
| 6 | — | `finishing-a-development-branch` |

**ترقية تلقائية:** إن اتضح أن العمل أكبر من المتوقع، توقّف، قل ذلك، وانتقل إلى `FULL`.

## جدول المهارات

| المهارة | متى تُستخدم | المسار |
|---|---|---|
| `brainstorming` | قبل أي عمل إبداعي: ميزة، مكوّن، تطبيق، أو تعديل سلوك | `brainstorming/SKILL.md` |
| `writing-plans` | تفكيك العمل إلى خطة مهام صغيرة قابلة للمراجعة | `writing-plans/SKILL.md` |
| `executing-plans` | تنفيذ خطة قائمة مهمة بمهمة داخل الجلسة (دون subagent) | `executing-plans/SKILL.md` |
| `test-driven-development` | دورة RED-GREEN-REFACTOR: اختبار فاشل أولاً، ثم أقل كود | `test-driven-development/SKILL.md` |
| `systematic-debugging` | تشخيص جذري: 4 مراحل، لا تخمين ولا إصلاح بالصدفة | `systematic-debugging/SKILL.md` |
| `requesting-code-review` | قائمة تحقّق قبل طلب مراجعة الكود | `requesting-code-review/SKILL.md` |
| `receiving-code-review` | الرد على ملاحظات المراجعة دون جدال ولا خضوع | `receiving-code-review/SKILL.md` |
| `using-git-worktrees` | عزل العمل في worktree حتى لا تتلوّث الفرع الحالي | `using-git-worktrees/SKILL.md` |
| `finishing-a-development-branch` | إنهاء الفرع: تحقق، ثم دمج/PR/حذف بقرار صريح | `finishing-a-development-branch/SKILL.md` |
| `verification-before-completion` | لا تقل «تم» قبل تشغيل أمر تحقّق حقيقي ورؤية نتيجته | `verification-before-completion/SKILL.md` |
| `diagnosing-superpowers` | تشخيص جلسة تصرّفت فيها المهارات بغرابة، بدليل من السجل | `diagnosing-superpowers/SKILL.md` |
| `writing-skills` | كتابة مهارة جديدة بأسلوب Superpowers | `writing-skills/SKILL.md` |

لا تعرف أيها ينطبق؟ شغّل: `qawa route "<الطلب>"`

## فروق هذه البيئة عن Claude Code (مهم)

1. **لا أداة subagent.** مهارات `subagent-driven-development` و
   `dispatching-parallel-agents` معزولة في `skills-unavailable/` — لا تستعملها،
   ولا تختلق إرسالاً لمهارة فرعية. البديل: `executing-plans` (تنفيذ داخلي).
   عندما تطلب مهارة مراجعاً مستقلاً، اقرأ `executing-plans/code-reviewer.md`
   ونفّذ المراجعة بنفسك، ثم سجّل: `Final review: self-review (no subagent tool)`.
2. **لا أداة `Skill`.** حمّل المهارة بقراءة ملفها من المسار في الجدول أعلاه.
3. **لا `TodoWrite`.** السجل في ملف هو الذاكرة. الذاكرة بين الجلسات = ملفات فقط.
4. **كل جلسة جديدة تبدأ من الصفر.** اقرأ السجل (`.qawa/STATE.md`) أولاً إن وُجد.

## السجل (الذاكرة العابرة للجلسات) — إلزامي

حدّثه **بعد كل مهمة**، لا في النهاية: `qawa note "<سطر>"`.

```
Task <N>: complete (commits <base7>..<head7>, review clean)
Ruling: <ما قررته> — <لماذا> — <تكلفته إن كان خطأ>
```

بدون سجل، أي انقطاع يعني إعادة تنفيذ عمل منجز. هذا أغلى فشل معروف.

## بوابة «لا تكذب بالنجاح»

- لا تقل «تم» قبل تشغيل أمر تحقّق حقيقي ورؤية نتيجته.
- لا تكتب كوداً قبل اختبار فاشل (إلا سكربت تجريبي معلن أنه throwaway).
- إن كتبت كوداً قبل اختباره: احذفه وابدأ من الاختبار.

## الرفيق البصري (visual companion)

يعمل، لكن المنفذ لا يظهر تلقائياً كمعاينة في البيئات السحابية. البديل الموثوق:
ملف HTML ثابت داخل مساحة العمل. ولمنع تحميل الشعار من موقع المصدر:
`SUPERPOWERS_DISABLE_TELEMETRY=1`.
