<!-- qawa:generated v1 skills=brainstorming,diagnosing-superpowers,executing-plans,finishing-a-development-branch,receiving-code-review,requesting-code-review,systematic-debugging,test-driven-development,using-git-worktrees,using-superpowers,verification-before-completion,writing-plans,writing-skills -->

# AGENTS.md — انسخ هذا الملف إلى جذر أي مشروع

> حتى لو نسيتَ ذكر qawa في أول رسالة، الوكيل يرى هذا الملف في المشروع.

## قبل أي إجراء

حمّل المهارة المطابقة — الموجّه في `.qawa/ROUTER.md` داخل هذا المشروع
(ينسخه `qawa init`)، أو اسأل qawa مباشرة:

```
qawa boot              # السطر الجاهز للصقه في المحادثة
qawa route "<الطلب>"     # أي مهارة تنطبق؟
qawa use <name>        # اقرأ المهارة
```

## ترتيب الأولوية

1. تعليمات المستخدم الصريحة
2. قيود بيئة التنفيذ (لا subagent، لا Skill tool، لا شبكة)
3. المهارة المنطبقة
4. حكمك الهندسي

القاعدة: **مهارة منطبقة فعلاً = التزام ما دامت منطبقة** — قبل أسئلة التوضيح،
ودون أن تتغلب على تعليمات المستخدم ولا على حكمك.

## بيئة التنفيذ

- لا أداة `Skill` → اقرأ ملف المهارة.
- لا أداة subagent → نفّذ داخلياً عبر `executing-plans`. لا تختلق إرسالاً.
- لا `TodoWrite` → السجل في `.qawa/STATE.md` هو الذاكرة.

## الوضع

`MODE: FAST` لتغيير بسيط (TDD + تحقق فقط).
`MODE: FULL` لميزة (تصميم ← worktree ← خطة ← تنفيذ ← مراجعة ← إنهاء).
رتّقِ تلقائياً من FAST إلى FULL إن كبر العمل.

## اتفاقيات هذا المستودع

- التصاميم: `docs/superpowers/specs/YYYY-MM-DD-<topic>-design.md`
- الخطط: `docs/superpowers/plans/YYYY-MM-DD-<feature>.md`
- السجل وبيانات العمل: `.qawa/` (مضاف إلى `.gitignore`)
- worktrees: `.worktrees/` (مضاف إلى `.gitignore`)

## المهارات المتاحة

`brainstorming`, `writing-plans`, `executing-plans`, `test-driven-development`, `systematic-debugging`, `requesting-code-review`, `receiving-code-review`, `using-git-worktrees`, `finishing-a-development-branch`, `verification-before-completion`, `diagnosing-superpowers`, `writing-skills`

## بوابة الجودة

- لا كود بدون اختبار فاشل أولاً.
- لا «تم» قبل تشغيل أمر تحقق حقيقي ورؤية النتيجة.
- لا تدمج ولا تدفع دون طلب صريح.
