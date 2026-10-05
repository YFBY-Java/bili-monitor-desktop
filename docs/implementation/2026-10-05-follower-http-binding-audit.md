# Follower HTTP Long input binding audit — 2026-10-05

Status: read-only verification of the original B/S baseline; no UID strategy implemented. This is not M06 completion or full M01–M18 completion. Current desktop does not promise a one-to-one HTTP transport compatibility layer, so raw HTTP behavior below is separate from actual UI business input behavior.

## Scope and oracle environment

- Original read-only source HEAD: `fa2faa6c11c89376cd8e492856bdaf5cc58ac400`, root `D:\codex_work\BiliMonitor`.
- Desktop HEAD verified: `b2e5a89c3d08c63e6a811567e69019b80b39bff7`; index remained empty. No production/source code or index/HEAD changed by this audit.
- Local historical API material was read first: [user/info.md](D:/codex_work/bilibili-API-collect-new/docs/user/info.md:518), card endpoint at line 520, numeric request MID at 528, string response MID at 557. This is historical material, not present-platform proof or request authorization.
- Actual in-memory environment: JDK **20.0.1**, Jackson **2.17.3**, Spring **6.1.15**, Hibernate Validator **8.0.1.Final**, original compiled DTO/controller/service/advice classes from `D:/codex_work/BiliMonitor/social-data-monitor/backend/target/classes/`. The POM sets Java 17 and Boot 3.3.6 ([pom.xml](D:/codex_work/BiliMonitor/social-data-monitor/backend/pom.xml:7)); the oracle runtime is JDK 20, not a claim about every JVM.
- Existing Groovy: `D:\JetBrains\PyCharm 2025.3.4\lib\groovy.jar`; existing Maven dependencies: `D:\codex_work\BiliMonitor\social-data-monitor\.dev-tools\maven-repository`. Old C-drive entries in the existing test-classpath file were remapped to this verified D repository, and only existing D entries were used. Java executable is the existing `E:\java\jdk20\bin\java.exe`. Temp stays on activated D paths.
- Mapper is Spring's `Jackson2ObjectMapperBuilder.json()`, with the source's `non_null` and `Asia/Shanghai` settings, not a bare test ObjectMapper. Actual flags: `FAIL_ON_UNKNOWN_PROPERTIES=false`, `ACCEPT_FLOAT_AS_INT=true`, `ALLOW_COERCION_OF_SCALARS=true`. Source configuration: [application.yml](D:/codex_work/BiliMonitor/social-data-monitor/backend/src/main/resources/application.yml:13). No application mapper/coercion overrides were found in the delegated read-only source audit.
- Standalone MockMvc used the real compiled controller and exception advice, matching mapper, and a LocalValidatorFactoryBean. The service was mocked/inert, with only the actual private interval resolver invoked separately. No SpringApplication, listening socket, Worker, real HTTP, credentials, user database, build/install, or new Java/C/Rust source.
- Final reproducible oracle exited 0 and emitted **274 JSON records**: 98 DTO observations, 158 MockMvc observations, 17 pure compiled service observations, 1 environment record. These are diagnostic observations, not 274 platform or assertion-suite passes. Earlier null reflection-varargs harness error was corrected with `[value] as Object[]` and affected valid-add cases were reverified.
- The exact embedded PowerShell block was rerun from this saved report: exit 0, the same 274 records; 14 selected diagnostic assertions verified status/code, exact near-MAX wire value, float boundary, and the empty-limit default. No full check or real-platform acceptance was performed.

## Source contract and exception mapping

| Endpoint/input | Authoritative source |
|---|---|
| POST `/api/bilibili/follower-monitor/users` | [Controller:43](D:/codex_work/BiliMonitor/social-data-monitor/backend/src/main/java/com/socialmonitor/bilibili/controller/BilibiliFollowerMonitorController.java:43): `@Valid @RequestBody`; [Add DTO:6](D:/codex_work/BiliMonitor/social-data-monitor/backend/src/main/java/com/socialmonitor/bilibili/dto/AddBilibiliMonitorUserRequest.java:6): `@NotNull @Min(1) Long mid`, nullable `@Min(1) Integer intervalSeconds`. |
| PATCH `/users/{userId}/status` | [Controller:48](D:/codex_work/BiliMonitor/social-data-monitor/backend/src/main/java/com/socialmonitor/bilibili/controller/BilibiliFollowerMonitorController.java:48): path Long, valid body; [Status DTO:5](D:/codex_work/BiliMonitor/social-data-monitor/backend/src/main/java/com/socialmonitor/bilibili/dto/UpdateBilibiliMonitorStatusRequest.java:5): `@NotNull Boolean enabled`. |
| PATCH or PUT `/users/{userId}/settings` | [Controller:56](D:/codex_work/BiliMonitor/social-data-monitor/backend/src/main/java/com/socialmonitor/bilibili/controller/BilibiliFollowerMonitorController.java:56): path Long, valid body; [Settings DTO:6](D:/codex_work/BiliMonitor/social-data-monitor/backend/src/main/java/com/socialmonitor/bilibili/dto/UpdateBilibiliMonitorSettingsRequest.java:6): `@NotNull @Min(1) Integer intervalSeconds`. |
| GET `/users/{userId}/history`, GET `/trends` | [Controller:75](D:/codex_work/BiliMonitor/social-data-monitor/backend/src/main/java/com/socialmonitor/bilibili/controller/BilibiliFollowerMonitorController.java:75), [Controller:85](D:/codex_work/BiliMonitor/social-data-monitor/backend/src/main/java/com/socialmonitor/bilibili/controller/BilibiliFollowerMonitorController.java:85): path Long / optional List<Long> userIds, optional ISO OffsetDateTime bounds, int limit/default 500. No positive-ID annotations. |
| Refresh/delete IDs | [Controller:64](D:/codex_work/BiliMonitor/social-data-monitor/backend/src/main/java/com/socialmonitor/bilibili/controller/BilibiliFollowerMonitorController.java:64), [Controller:69](D:/codex_work/BiliMonitor/social-data-monitor/backend/src/main/java/com/socialmonitor/bilibili/controller/BilibiliFollowerMonitorController.java:69): the same unannotated path Long binding. |

[GlobalExceptionHandler:15](D:/codex_work/BiliMonitor/social-data-monitor/backend/src/main/java/com/socialmonitor/common/exception/GlobalExceptionHandler.java:15) maps BusinessException to HTTP 400 with its own code. At [line 21](D:/codex_work/BiliMonitor/social-data-monitor/backend/src/main/java/com/socialmonitor/common/exception/GlobalExceptionHandler.java:21), DTO/constraint validation maps to 400 `VALIDATION_FAILED`. At [line 27](D:/codex_work/BiliMonitor/social-data-monitor/backend/src/main/java/com/socialmonitor/common/exception/GlobalExceptionHandler.java:27), other exceptions map to 500 `INTERNAL_ERROR`. MockMvc confirmed that HttpMessageNotReadableException and MethodArgumentTypeMismatchException use the **500** branch, not a generic assumed Spring 400.

[ApiResponse:22](D:/codex_work/BiliMonitor/social-data-monitor/backend/src/main/java/com/socialmonitor/common/response/ApiResponse.java:22) creates false/code/message/null-data/current-timestamp. Source `non_null` causes error responses to contain `success/code/message/timestamp` and **omit data**, not `data:null`.

## JSON body MID goldens

“Accepted” means exact binding + DTO validation succeeded and the inert oracle callback was entered; it does **not** assert platform collection success. Actual add then fetches card and can produce a BusinessException ([Service:64](D:/codex_work/BiliMonitor/social-data-monitor/backend/src/main/java/com/socialmonitor/bilibili/service/BilibiliFollowerMonitorService.java:64)).

| Raw JSON mid | Bound Long / result |
|---|---|
| missing, null, `""`, `"   "`, `"null"` | null → 400 `VALIDATION_FAILED` / NotNull |
| `0`, `0.9`, `1e-3` | 0 → 400 validation / Min |
| `-1.9`, `-9223372036854775808` | -1 / Long.MIN → 400 validation / Min |
| `22`, `22.9`, `2.2e1` | 22, accepted (float truncation toward zero) |
| `9223372036854775807` | exact Long.MAX, accepted |
| `9223372036854775808`, `-9223372036854775809` | integer range error → 500 `INTERNAL_ERROR` |
| `9223372036854775808.0`, `9.223372036854776e18` | Long.MAX, accepted: IEEE double boundary equals rounded Long bound |
| `9.223372036854778e18`, `1e100`, `1e309` | numeric range error → 500; not unconditional saturation |
| `"22"`, `"+22"`, `"00022"`, many leading zeros | 22, accepted |
| `" 22 "`, escaped tab/newline, escaped U+0000/U+001F wrapping 22 | 22, accepted: String.trim boundary behavior |
| `"2 2"`, interior tab, NBSP wrapping 22 | invalid string → 500 |
| Arabic BMP `"٢٢"`, fullwidth BMP `"２２"` | 22, accepted in this JDK 20 oracle |
| astral decimal digits, Unicode minus | invalid string → 500 |
| `"9223372036854775807"`, `"+9223372036854775807"` | exact Long.MAX, accepted |
| `"9223372036854775808"` | invalid/range string → 500 |
| `"22.0"`, `"2.2e1"`, `"0x16"`, `"NULL"` | invalid string → 500 |
| true/false, array, object as mid | type error → 500 |
| nonstandard raw tokens `0x16`, `+22`, `00022` | JSON parse error → 500 |
| entire body `null` or missing body | required-body read error → 500 (different from `{}` → 400) |
| extra unknown field with valid mid | ignored; accepted |

This is **HTTP DTO binding**, not the Bilibili response `parseLong` semantics: HTTP integer overflow rejects rather than low-64 wrapping; HTTP strings trim rather than preserve edge whitespace; huge HTTP floats reject instead of arbitrary saturation. Do not reuse response parsing as an input binder or infer raw JSON MID from an already-rounded JavaScript Number.

## Interval, status, and query boundaries

### Interval

JSON Integer binding uses the same scalar/float coercion family but Int32 bounds. `120.9` / `1.2e2` → 120; `" +120 "` → 120; `2147483648` / `2147483648.0` reject. String exponent/hex reject. Add missing/null/empty/`"null"` interval binds null and passes nullable @Min, then defaults; settings missing/null/empty/`"null"` violates @NotNull and is 400 validation. Bound zero/negative violates @Min.

Source default configuration is 3600 / min 1 / max 2,592,000 / warning 60 ([application.yml:67](D:/codex_work/BiliMonitor/social-data-monitor/backend/src/main/resources/application.yml:67), [properties:13](D:/codex_work/BiliMonitor/social-data-monitor/backend/src/main/java/com/socialmonitor/bilibili/config/BilibiliFollowerMonitorProperties.java:13)). This audit did not read deployment env/credentials. Actual [resolveInterval:275](D:/codex_work/BiliMonitor/social-data-monitor/backend/src/main/java/com/socialmonitor/bilibili/service/BilibiliFollowerMonitorService.java:275) was invoked: null→3600; 1 and 59 return their values with WARN; 60 and 2,592,000 return normally; 2,592,001 → BusinessException BAD_REQUEST (MVC 400). The DTO does not itself enforce the business maximum. Add resolves interval before fetch; settings checks existing user before resolving interval ([Service:88](D:/codex_work/BiliMonitor/social-data-monitor/backend/src/main/java/com/socialmonitor/bilibili/service/BilibiliFollowerMonitorService.java:88)).

### Status

- JSON true/false pass. JSON integer 0→false; every tested nonzero integer, including -1 and a value beyond Long.MAX, →true.
- JSON 1.0 / 1e0 reject with 500 read error.
- `"true"/"TRUE"/"True"` and trimmed forms pass; likewise recognized false forms. Arbitrary mixed case `"tRuE"` and strings `"0"/"1"` reject.
- Missing/null/empty/blank/`"null"` →null→400 NotNull; `"NULL"` is a 500 invalid string.

### Path/query (Spring conversion, not Jackson)

- Path Long and query List<Long> accept decimal signs/leading zeros and `0x16`/`0X16`/`#16` →22; `-0x16`→-22. `022` means decimal 22, not octal. `+0x16`, binary/octal prefixes, fractional/scientific text and overflow reject with 500 MethodArgumentTypeMismatchException.
- Spring removes internal whitespace: `2 2` / `2\t2`→22; U+2000 edges pass, NBSP does not. The same interior-space JSON body string rejects.
- IDs 0/-1 bind; no @Min applies. Actual compiled `requireUser` through trend with mocked empty repository returns NOT_FOUND, which advice maps to 400 ([Service:305](D:/codex_work/BiliMonitor/social-data-monitor/backend/src/main/java/com/socialmonitor/bilibili/service/BilibiliFollowerMonitorService.java:305)). Do not call these positive MID validations.
- userIds absent→null and empty text→[]; both choose all users ([Service:122](D:/codex_work/BiliMonitor/social-data-monitor/backend/src/main/java/com/socialmonitor/bilibili/service/BilibiliFollowerMonitorService.java:122)). Comma-separated or repeated IDs bind [1,2]; `1,,2` binds [1,null,2], not a validation error at the controller.
- limit missing/empty binds the **integer value 500** (not HTTP 500). int scalar aliases bind similarly; zero/negative reach service and normalize to the integer value 500; positive values cap at 2000 ([Service:298](D:/codex_work/BiliMonitor/social-data-monitor/backend/src/main/java/com/socialmonitor/bilibili/service/BilibiliFollowerMonitorService.java:298)). Above Int32 / fractional / scientific / `null` text is an HTTP 500 type mismatch.
- Offset ISO timestamps with Z or explicit +08:00 bind. Empty bound→null; date-only/bad text→500 type mismatch. This audit did not extend to SQL date-range policy.

## Old Web input → actual wire is a separate layer

The old follower page [BilibiliView:506](D:/codex_work/BiliMonitor/social-data-monitor/frontend/src/views/bilibili/BilibiliView.vue:506) runs Number(input), then Number.isInteger and >0—not SafeInteger. [API:60](D:/codex_work/BiliMonitor/social-data-monitor/frontend/src/api/bilibili.ts:60) and [http:21](D:/codex_work/BiliMonitor/social-data-monitor/frontend/src/api/http.ts:21) hand the Number to existing Axios JSON.stringify. Delegated audit executed the installed Axios default transformRequest offline; no HTTP was sent.

| Original UI text | Actual JSON token | Backend binding |
|---|---|---|
| +22, 00022, whitespace 22, 22.0, 2.2e1, 0x16, 0b10110, 0o26 | 22 | Long 22 |
| 1.0000000000000001 | 1 | Long 1 |
| 9007199254740993 | 9007199254740992 | exact wire value, not original text |
| 9223372036854774784 | 9223372036854775000 | **exact Long 9223372036854775000** |
| 9223372036854775807 | 9223372036854776000 | integer overflow →500 |
| 999999999999999999999 / 1e21 | 1e+21 | float range error →500 |
| 1e308 | 1e+308 | float range error →500 |

`BigInt(Number("9223372036854774784"))` would be 9223372036854774784, **not** the actual JSON decimal token. UI rounded-wire compatibility cannot be inferred from that BigInt conversion.

Empty/zero/negative/actual fractional/nonfinite/Arabic or fullwidth text is rejected by the follower UI before transport. The separate Subject entry uses Number.isSafeInteger ([SubjectListView:149](D:/codex_work/BiliMonitor/social-data-monitor/frontend/src/views/subjects/SubjectListView.vue:149)); do not merge its domain with the follower page.

At the time of this read-only audit, exact-UID vs strict old-Number/JSON-rounded behavior was awaiting a user choice. The user subsequently explicitly chose precision-safe UID input with compatible integer notation and rejection of true fractions/Long overflow; implementation is tracked separately in [the UID input audit](2026-10-05-follower-uid-input-audit.md). This report supplies binding and wire evidence only, does not itself implement that strategy, and does not imply the desktop must expose the original HTTP coercion/error surface.

## Reproduce without starting the application

Copy the following PowerShell block into a shell. It uses only the existing D/E artifacts, creates no source file, runs Groovy in memory, and prints all oracle records. The mock servlet initialization messages are MockMvc setup, not a listening application server. The existing JVM may emit a Mockito/ByteBuddy class-sharing warning. The script uses mocked/inert service paths; 200 in its output means binding/validation and the intentionally inert callback succeeded, not a platform or DB acceptance test.

```powershell
. 'D:\codex_work\bili_reptile\bili-monitor-desktop\scripts\activate-environment.ps1'

# Read-only, in-memory oracle: no app server, sockets, database, platform call,
# build, dependency download, original-source writes, or new Java source.
$httpOracleRepo = 'D:\codex_work\BiliMonitor\social-data-monitor\.dev-tools\maven-repository'
$httpOracleDClasspath = (((Get-Content -Raw -LiteralPath 'D:\codex_work\BiliMonitor\social-data-monitor\backend\target\test-classpath.txt').Trim() -split ';') |
    ForEach-Object { $_.Replace('C:\Users\<USER>\.m2\repository', $httpOracleRepo) } |
    Where-Object { Test-Path -LiteralPath $_ }) -join ';'
$httpOracleClasspath = 'D:\JetBrains\PyCharm 2025.3.4\lib\groovy.jar;D:\codex_work\BiliMonitor\social-data-monitor\backend\target\classes;' + $httpOracleDClasspath
if (($httpOracleClasspath -split ';' | Where-Object { $_ -notmatch '^D:' }).Count -gt 0) {
    throw 'Oracle dependencies must be D-only'
}

$httpOracleScript = @'
import com.fasterxml.jackson.annotation.JsonInclude
import com.fasterxml.jackson.core.JsonGenerator
import com.fasterxml.jackson.databind.DeserializationFeature
import com.fasterxml.jackson.databind.MapperFeature
import org.springframework.http.converter.json.Jackson2ObjectMapperBuilder
import org.springframework.http.converter.json.MappingJackson2HttpMessageConverter
import org.springframework.validation.beanvalidation.LocalValidatorFactoryBean
import org.springframework.test.web.servlet.setup.MockMvcBuilders
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders as R
import org.springframework.http.MediaType
import org.mockito.Mockito
import com.socialmonitor.bilibili.controller.BilibiliFollowerMonitorController
import com.socialmonitor.bilibili.service.BilibiliFollowerMonitorService
import com.socialmonitor.bilibili.repository.BilibiliFollowerMonitorRepository
import com.socialmonitor.bilibili.config.BilibiliFollowerMonitorProperties
import com.socialmonitor.bilibili.dto.AddBilibiliMonitorUserRequest
import com.socialmonitor.bilibili.dto.UpdateBilibiliMonitorSettingsRequest
import com.socialmonitor.bilibili.dto.UpdateBilibiliMonitorStatusRequest
import com.socialmonitor.common.exception.GlobalExceptionHandler
import java.lang.reflect.InvocationTargetException

def mapper = Jackson2ObjectMapperBuilder.json().serializationInclusion(JsonInclude.Include.NON_NULL).timeZone('Asia/Shanghai').build()
mapper.configure(JsonGenerator.Feature.ESCAPE_NON_ASCII, true)
def validator = new LocalValidatorFactoryBean()
validator.afterPropertiesSet()
def printJson = { value -> println mapper.writeValueAsString(value) }
printJson([java: System.getProperty('java.version'), jackson: mapper.version().toString(), spring: org.springframework.core.SpringVersion.getVersion(), validator: org.hibernate.validator.internal.util.Version.versionString,
    failUnknown: mapper.isEnabled(DeserializationFeature.FAIL_ON_UNKNOWN_PROPERTIES), floatAsInt: mapper.isEnabled(DeserializationFeature.ACCEPT_FLOAT_AS_INT), scalarCoercion: mapper.isEnabled(MapperFeature.ALLOW_COERCION_OF_SCALARS),
    dtoCodeSource: AddBilibiliMonitorUserRequest.protectionDomain.codeSource.location.toString()])

def addCases = [
    ['missing','{}'], ['null','{"mid":null}'], ['zero','{"mid":0}'], ['min','{"mid":-9223372036854775808}'],
    ['integer','{"mid":22}'], ['longMax','{"mid":9223372036854775807}'], ['overflow','{"mid":9223372036854775808}'], ['underflow','{"mid":-9223372036854775809}'],
    ['float','{"mid":22.9}'], ['floatZero','{"mid":0.9}'], ['negativeFloat','{"mid":-1.9}'], ['scientific','{"mid":2.2e1}'], ['smallExponent','{"mid":1e-3}'],
    ['floatLongBoundary','{"mid":9223372036854775808.0}'], ['floatRoundedBoundary','{"mid":9.223372036854776e18}'], ['floatAboveBoundary','{"mid":9.223372036854778e18}'], ['hugeFloat','{"mid":1e100}'], ['infiniteFloat','{"mid":1e309}'],
    ['strPlus','{"mid":"+22"}'], ['strLeadingZeros','{"mid":"00022"}'], ['strManyZeros','{"mid":"00000000000000000000000000000000000000000022"}'], ['strTrim','{"mid":" 22 "}'],
    ['strEmpty','{"mid":""}'], ['strBlank','{"mid":"   "}'], ['strNull','{"mid":"null"}'], ['strUpperNull','{"mid":"NULL"}'],
    ['strDecimal','{"mid":"22.0"}'], ['strScientific','{"mid":"2.2e1"}'], ['strHex','{"mid":"0x16"}'], ['strMax','{"mid":"9223372036854775807"}'], ['strOverflow','{"mid":"9223372036854775808"}'],
    ['boolean','{"mid":true}'], ['array','{"mid":[22]}'], ['object','{"mid":{"value":22}}'], ['unknown','{"mid":22,"extra":true}'],
    ['jsonHex','{"mid":0x16}'], ['jsonPlus','{"mid":+22}'], ['jsonLeadingZeros','{"mid":00022}'], ['bodyNull','null'], ['bodyMissing',''],
    ['wireSafeOverflowRounded','{"mid":9007199254740992}'], ['wireNearMax','{"mid":9223372036854775000}'], ['wireMaxOverflow','{"mid":9223372036854776000}'], ['wire1e21','{"mid":1e+21}'],
    ['intervalMissing','{"mid":22}'], ['intervalNull','{"mid":22,"intervalSeconds":null}'], ['intervalEmpty','{"mid":22,"intervalSeconds":""}'], ['intervalNullString','{"mid":22,"intervalSeconds":"null"}'],
    ['intervalZero','{"mid":22,"intervalSeconds":0}'], ['intervalShort','{"mid":22,"intervalSeconds":1}'], ['interval59','{"mid":22,"intervalSeconds":59}'], ['interval60','{"mid":22,"intervalSeconds":60}'],
    ['intervalMaxBusiness','{"mid":22,"intervalSeconds":2592000}'], ['intervalAboveBusiness','{"mid":22,"intervalSeconds":2592001}'], ['intervalMaxInt','{"mid":22,"intervalSeconds":2147483647}'], ['intervalIntOverflow','{"mid":22,"intervalSeconds":2147483648}'],
    ['intervalFloat','{"mid":22,"intervalSeconds":120.9}'], ['intervalScientific','{"mid":22,"intervalSeconds":1.2e2}'], ['intervalStringTrim','{"mid":22,"intervalSeconds":" +120 "}'], ['intervalStringHex','{"mid":22,"intervalSeconds":"0x78"}']
]
[
    ['asciiControlTrim','\u0000'+'22'+'\u001f'], ['tabNewline','\t22\n'], ['interiorSpace','2 2'], ['interiorTab','2\t2'], ['nbsp','\u00a022\u00a0'],
    ['arabicBmp','\u0662\u0662'], ['fullwidthBmp','\uff12\uff12'], ['astralDecimal','\ud835\udfe2\ud835\udfe2'], ['unicodeMinus','\u221222']
].each { c -> addCases << ['str:'+c[0], mapper.writeValueAsString([mid:c[1]])] }

def settingsCases = [
    ['missing','{}'], ['null','{"intervalSeconds":null}'], ['empty','{"intervalSeconds":""}'], ['nullString','{"intervalSeconds":"null"}'], ['zero','{"intervalSeconds":0}'],
    ['short','{"intervalSeconds":1}'], ['float','{"intervalSeconds":120.9}'], ['aboveBusiness','{"intervalSeconds":2592001}']
]
def statusCases = [
    ['missing','{}'], ['null','{"enabled":null}'], ['true','{"enabled":true}'], ['false','{"enabled":false}'], ['int0','{"enabled":0}'], ['int1','{"enabled":1}'], ['intNegative','{"enabled":-1}'], ['largeInt','{"enabled":9223372036854775808}'],
    ['float','{"enabled":1.0}'], ['exponent','{"enabled":1e0}'], ['strTrue','{"enabled":"true"}'], ['strTRUE','{"enabled":"TRUE"}'], ['strTrueTitle','{"enabled":"True"}'], ['strMixed','{"enabled":"tRuE"}'], ['strTrim','{"enabled":" true "}'],
    ['str0','{"enabled":"0"}'], ['str1','{"enabled":"1"}'], ['strNull','{"enabled":"null"}'], ['strNULL','{"enabled":"NULL"}'], ['strEmpty','{"enabled":""}'], ['strBlank','{"enabled":"  "}']
]
[
    [prefix:'dto:add',type:AddBilibiliMonitorUserRequest,cases:addCases],
    [prefix:'dto:settings',type:UpdateBilibiliMonitorSettingsRequest,cases:settingsCases],
    [prefix:'dto:status',type:UpdateBilibiliMonitorStatusRequest,cases:statusCases]
].each { g -> g.cases.each { c ->
    def out=[case:g.prefix+':'+c[0],raw:c[1]]
    try {
        def dto=mapper.readValue(c[1],g.type)
        out.fields=dto == null ? 'null' : dto.toString()
        if(dto != null) out.violations=validator.validate(dto).collect { it.propertyPath.toString()+':'+it.constraintDescriptor.annotation.annotationType().simpleName }.sort()
    } catch(Exception e) { out.error=e.class.simpleName }
    printJson(out)
} }

// The real private interval resolver runs without API/repository collaborators.
// Mocked controller service performs only that resolver, not collection/storage.
def intervalOnlyService=new BilibiliFollowerMonitorService(null,null,new BilibiliFollowerMonitorProperties(),null,null)
def resolveInterval=BilibiliFollowerMonitorService.getDeclaredMethod('resolveInterval',Integer)
resolveInterval.accessible=true
def resolve={ Integer value -> try { resolveInterval.invoke(intervalOnlyService,[value] as Object[]) } catch(InvocationTargetException e) { throw e.cause } }
def service=Mockito.mock(BilibiliFollowerMonitorService)
Mockito.when(service.addUser(Mockito.any(AddBilibiliMonitorUserRequest))).thenAnswer { invocation -> resolve(invocation.arguments[0].intervalSeconds()); return null }
Mockito.when(service.updateInterval(Mockito.anyLong(),Mockito.anyInt())).thenAnswer { invocation -> resolve(invocation.arguments[1]); return null }
def mvc=MockMvcBuilders.standaloneSetup(new BilibiliFollowerMonitorController(service)).setControllerAdvice(new GlobalExceptionHandler()).setMessageConverters(new MappingJackson2HttpMessageConverter(mapper)).setValidator(validator).build()
def base='/api/bilibili/follower-monitor'
def httpCases=[]
addCases.each { c -> httpCases << [name:'mvc:add:'+c[0],request:R.post(base+'/users').contentType(MediaType.APPLICATION_JSON).content(c[1])] }
settingsCases.each { c -> httpCases << [name:'mvc:settings:'+c[0],request:R.patch(base+'/users/22/settings').contentType(MediaType.APPLICATION_JSON).content(c[1])] }
statusCases.each { c -> httpCases << [name:'mvc:status:'+c[0],request:R.patch(base+'/users/22/status').contentType(MediaType.APPLICATION_JSON).content(c[1])] }
httpCases << [name:'mvc:settings:put',request:R.put(base+'/users/22/settings').contentType(MediaType.APPLICATION_JSON).content('{"intervalSeconds":120}')]
['22','+22','00022',' 22 ','0x16','0X16','#16','022','-1','0','9223372036854775807','9223372036854775808','22.9','2.2e1'].each { value -> httpCases << [name:'mvc:path:'+value,request:R.get(base+'/users/{userId}/history',[value] as Object[])] }
['22','+22','00022',' 22 ','0x16','#16','022','-1','0','9223372036854775807','9223372036854775808','22.9','2.2e1','','1,2','1,,2','2 2','2\t2','\u200022\u2000','\u00a022\u00a0','-0x16','+0x16','0b10110','0o26'].each { value -> httpCases << [name:'mvc:userIds:'+value,request:R.get(base+'/trends').param('userIds',value)] }
httpCases << [name:'mvc:userIds:missing',request:R.get(base+'/trends')]
httpCases << [name:'mvc:userIds:repeated',request:R.get(base+'/trends').param('userIds',['1','2'] as String[])]
['','0','-1','+22','0x16','#16','022',' 22 ','2001','2147483647','2147483648','22.9','2.2e1','null'].each { value -> httpCases << [name:'mvc:limit:'+value,request:R.get(base+'/users/22/history').param('limit',value)] }
['2026-10-05T12:00:00Z','2026-10-05T20:00:00+08:00','2026-10-05','bad',''].each { value -> httpCases << [name:'mvc:from:'+value,request:R.get(base+'/users/22/history').param('from',value)] }
httpCases.each { c ->
    Mockito.clearInvocations(service)
    def result=mvc.perform(c.request).andReturn()
    def body=mapper.readValue(result.response.contentAsString,Map)
    def out=[case:c.name,status:result.response.status,code:body.code,keys:body.keySet().sort()]
    if(result.resolvedException != null) out.exception=result.resolvedException.class.simpleName
    def calls=Mockito.mockingDetails(service).invocations.collect { call -> [method:call.method.name,args:call.arguments.collect { a -> a == null ? 'null' : a.toString() }] }
    if(!calls.empty) out.calls=calls
    printJson(out)
}
[null,0,1,59,60,2592000,2592001].each { value ->
    def out=[case:'compiled:resolveInterval',input:value == null ? 'null' : value]
    try { out.bound=resolve(value) } catch(Exception e) { out.error=e.class.simpleName;out.code=e.errorCode.toString() }
    printJson(out)
}
def domainService=new BilibiliFollowerMonitorService(Mockito.mock(BilibiliFollowerMonitorRepository),null,new BilibiliFollowerMonitorProperties(),null,null)
def normalize=BilibiliFollowerMonitorService.getDeclaredMethod('normalizeLimit',Integer.TYPE)
normalize.accessible=true
[-1,0,1,500,2000,2001,Integer.MAX_VALUE].each { n -> printJson([case:'compiled:normalizeLimit',input:n,output:normalize.invoke(domainService,[n] as Object[])]) }
[-1L,0L,Long.MAX_VALUE].each { id ->
    def out=[case:'compiled:missingUserTrend',id:id.toString()]
    try { domainService.trend(id,null,null,500) } catch(Exception e) { out.error=e.class.simpleName;out.code=e.errorCode.toString() }
    printJson(out)
}
validator.close()
'@

& 'E:\java\jdk20\bin\java.exe' "-Djava.io.tmpdir=$env:TEMP" -cp $httpOracleClasspath groovy.ui.GroovyMain -e $httpOracleScript
if ($LASTEXITCODE -ne 0) { throw "Read-only HTTP oracle failed: $LASTEXITCODE" }
```
