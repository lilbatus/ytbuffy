<p align="center">
  <img src="assets/social-preview.png" alt="YTBUFFY" width="720">
</p>

<p align="center"><a href="README.md">English</a> · <b>Türkçe</b></p>

# YTBUFFY

YouTube videolarını önceden belleğe yükleyen bir tarayıcı eklentisi. Bağlantın koptuğunda video oynamaya devam eder. Chrome, Edge, Firefox, Opera, Opera GX, Brave, Vivaldi ve Yandex Browser'da çalışır.

YouTube oynatıcısı yalnızca iki üç dakika ilerisini yükler; bağlantısı sık sık kopan biri için bu bir kesintiyi atlatmaya yetmez. YTBUFFY videoyu arka planda indirmeye devam eder ve oynatıcıyı bellekten besler. Böylece bağlantı olsa da olmasa da video, yüklenen kısmın sonuna kadar oynar.

## Özellikler

- **Kesintilerde oynamaya devam eder.** Video yüklenen kısmın sonuna kadar sürer, bu kısım içinde ileri geri de sarabilirsin.
- **Sayfa yenilense de durmaz.** Bağlantı yokken F5'e basarsan video eklentinin kendi oynatıcısında kaldığın yerden devam eder.
- **Yalnızca bellek.** Diske hiçbir şey yazılmaz; sekmeyi kapatınca her şey silinir.
- **Sunucu yok.** Eklenti yalnızca YouTube ile konuşur ve YouTube oynatıcısının kendi yaptığı istekleri kullanır. YouTube'un imza ve şifreleme koduna hiç dokunmaz.
- **Neyin yüklendiğini görürsün.** Yüklenen kısım ilerleme çubuğunda işaretlenir.
- **İngilizce ve Türkçe arayüz.**

## Kurulum

YTBUFFY hiçbir eklenti mağazasında yok; hazır sürümden kurulur. [Son sürüm](https://github.com/lilbatus/ytbuffy/releases/latest) sayfasında her tarayıcının kendi dosyası var, yalnızca kendi tarayıcının dosyasını indirmen yeterli:

| Tarayıcı | Dosya |
| --- | --- |
| Google Chrome | `ytbuffy-chrome-vX.Y.Z.zip` |
| Microsoft Edge | `ytbuffy-edge-vX.Y.Z.zip` |
| Mozilla Firefox | `ytbuffy-firefox-vX.Y.Z.zip` |
| Opera | `ytbuffy-opera-vX.Y.Z.zip` |
| Opera GX | `ytbuffy-operagx-vX.Y.Z.zip` |
| Brave | `ytbuffy-brave-vX.Y.Z.zip` |
| Vivaldi | `ytbuffy-vivaldi-vX.Y.Z.zip` |
| Yandex Browser | `ytbuffy-yandex-vX.Y.Z.zip` |

### Chrome, Edge, Opera, Opera GX, Brave, Vivaldi ve Yandex Browser

1. Zip'i saklayacağın bir klasöre çıkar. Tarayıcı eklentiyi bu klasörden yükler; sonradan silme ya da yerini değiştirme.
2. Aşağıdaki tablodan tarayıcının eklentiler sayfasını aç ve **Geliştirici modu**nu aç.
3. Tablodaki yükleme düğmesine tıkla ve çıkardığın klasörü seç. İngilizce arayüzde bu düğmenin adı her tarayıcıda **Load unpacked**.
4. Açık olan YouTube sekmelerini yenile.

| Tarayıcı | Eklentiler sayfası | Geliştirici modu anahtarı | Yükleme düğmesi |
| --- | --- | --- | --- |
| Chrome | `chrome://extensions` | sağ üstte | **Paketlenmemiş öğe yükle** |
| Edge | `edge://extensions` | sol kenar çubuğunun altında | **Açılmışı yükle** |
| Opera | `opera://extensions` | sağ üstte, arama kutusunun yanında | **Paketlenmemiş öge yükle** |
| Opera GX | `opera://extensions` | sağda, eklenti listesinin hemen üstünde | **Paketlenmemiş öge yükle** |
| Brave | `brave://extensions` | sağ üstte | **Paketlenmemiş öğe yükle** |
| Vivaldi | `vivaldi://extensions` | sağ üstte | **Paketlenmemişi Yükle** |
| Yandex Browser | `browser://extensions` | sağ üstte | **Paketlenmemiş öğe yükle** |

Güncellemek için yeni sürümü aynı klasöre, eski dosyaların üzerine çıkar ve eklentinin kartındaki yenile simgesine bas. Klasörün yerini değiştirmezsen ayarların korunur.

### Firefox

1. `about:debugging#/runtime/this-firefox` sayfasını aç.
2. **Geçici eklenti yükle…** (İngilizce arayüzde **Load Temporary Add-on…**) düğmesine tıkla ve indirdiğin zip'i seç. Zip'i çıkarman gerekmez.
3. Açık olan YouTube sekmelerini yenile.

Firefox'un normal sürümleri yalnızca Mozilla'nın imzaladığı eklentileri kalıcı olarak tutar. Bu yüzden Firefox kapanınca eklenti kaldırılır ve yeniden başlattıktan sonra tekrar yüklemen gerekir. Firefox Developer Edition, Nightly ve ESR ise eklentiyi kalıcı olarak tutabilir: `about:config` sayfasında `xpinstall.signatures.required` değerini `false` yap, zip'in adını `ytbuffy.xpi` olarak değiştir, sonra `about:addons` sayfasında dişli simgesine tıklayıp **Dosyadan eklenti yükle…** (İngilizce arayüzde **Install Add-on From File…**) ile onu seç.

### Kaynaktan derleyerek

[Node.js](https://nodejs.org) 20 veya daha yeni bir sürüm gerekir.

```bash
git clone https://github.com/lilbatus/ytbuffy.git
cd ytbuffy
npm install
npm run build
```

Bu komut her tarayıcıyı kendi klasörüne derler: `dist/chrome`, `dist/edge`, `dist/firefox` gibi. Kendi tarayıcının klasörünü yukarıdaki adımlarla yükle; Firefox'ta `dist/firefox` içindeki `manifest.json` dosyasını seç. Yalnızca bir tarayıcıyı derlemek için adını yaz, örneğin `npm run build -- firefox`. Güncellemek için son değişiklikleri çek, yeniden derle ve yenile simgesine bas.

## Kullanım

Bir video açtığında eklenti kendiliğinden çalışmaya başlar. İlerleme çubuğundaki mavi kısım, bellekte hazır olan bölümdür.

- **Popup:** eklentiyi aç ya da kapat, videonun ne kadarının yüklendiğini ve ne kadar bellek kullanıldığını gör, yüklemeyi başlat, duraklat ya da devam ettir.
- **Ayarlar:** her seçenek sayfanın kendisinde açıklanır. Arayüz dilini sağ üstteki **TR | ENG** ile değiştirebilirsin. Aşağıdaki [Dokümantasyon](#dokümantasyon) bölümü her ayarı daha ayrıntılı anlatır.

## Nasıl çalışır

YouTube'un web oynatıcısı videoyu belgelenmemiş bir protokol olan SABR ile çeker. YTBUFFY, oynatıcının kendi isteklerini şablon olarak alır ve videonun sonraki kısımlarını bunlarla belleğe indirir; her zaman oynatıcının kullandığı kalitede ve ses dilinde. Oynatıcı yeni bir parça istediğinde yanıt ağa hiç gitmeden doğrudan bellekten gelir. Bu yüzden bağlantı koptuğunda, yüklenen kısım bitene kadar oynatıcı bunu fark etmez. Her videonun ilk saniyelerinde oynatıcı yine YouTube'dan yükler; böylece eklenti devreye girmeden önce kaliteyi YouTube seçer.

## Dokümantasyon

### Ayarlar

Her ayarın varsayılan değeri adının yanında yazar.

#### Genel

**Eklenti açık** `açık`\
Eklentinin tamamını açar ya da kapatır. Kapalıyken YouTube eklenti hiç yokmuş gibi çalışır ve eklentinin kullandığı bellek hemen boşaltılır.

**Yükleme ne zaman başlasın** `oynamaya başlayınca`\
*Video açılınca* sen oynatmaya basmasan bile yüklemeyi hemen başlatır. *Oynamaya başlayınca* video gerçekten oynayana kadar bekler; böylece yalnızca bir anlığına açtığın videolar internet harcamaz. *Yalnızca butonla* seçeneğinde popup'taki **Yüklemeyi başlat**'a basana kadar hiçbir şey yüklenmez; kotalı bir bağlantıda işe yarar.

**Shorts'ta da çalışsın** `kapalı`\
Shorts kısa olduğu ve genelde birkaç saniyede geçildiği için önceden yüklemek çoğu zaman boşa internet harcar. Sık kopan bir bağlantıda çok Shorts izliyorsan aç.

**Canlı yayınlar** `her zaman kapalı`\
Canlı yayın o anda üretildiği için ileriden yüklenecek bir şey yoktur. Eklenti canlı yayınlara hiç karışmaz.

#### Kalite

**Kalite kilidi** `kapalı`\
Her videoyu seçtiğin kalitede oynatır ve o kalitede yükler. Kapalıyken kaliteyi her zamanki gibi YouTube seçer: her videonun ilk saniyelerinde oynatıcı doğrudan YouTube'dan yükler, ardından eklenti YouTube'un karar verdiği kaliteyi yükler. YouTube kaliteyi sonradan yükseltirse eklenti de onu takip eder; videoyu kendiliğinden daha düşük bir kaliteye ya da başka bir ses diline asla geçirmez. Her seferinde aynı kaliteyi istiyorsan ya da bir videonun ne kadar bellek ve internet harcayacağını kontrol etmek istiyorsan kalite kilitle.

**Videoda o kalite yoksa** `en yakın alt kalite`\
Her video her kalitede bulunmaz. Bellekten ve internetten tasarruf için en yakın alt kaliteyi, daha net görüntü için en yakın üst kaliteyi seç.

**Kalite değişikliğini takip et** `açık`\
Kaliteyi YouTube'un dişli menüsünden kendin değiştirdiğinde eski kalitede yüklenen kısım silinir ve yükleme bulunduğun yerden yeni kalitede yeniden başlar. Kapatırsan video yüklendiği kalitede oynamaya devam eder; seçtiğin kalite yalnızca henüz bellekte olmayan kısımlarda geçerli olur. Başka bir ses parçası ya da dil seçmen ve Stabil ses ise her zaman takip edilir: eklenti eski sesi siler ve seçtiğini yükler.

#### Önceden yükleme

**Ne kadar ileri yüklensin** `videonun sonuna kadar`\
*Videonun sonuna kadar* her şeyi yükler. En çok belleği ve interneti o harcar, ama ne kadar uzun sürerse sürsün her kesintiyi karşılar. *Belirli bir süre* yalnızca önündeki birkaç dakikayı hazır tutar ve izledikçe tamamlar.

**Hazır tutulacak dakika** `30`\
*Belirli bir süre* seçiliyken görünür. İzlediğin yerden itibaren videonun ne kadarının bellekte hazır tutulacağı. En uzun bağlantı kesintinden fazlasını seç: kesintiler en fazla üç dakika sürüyorsa on dakika rahat bir paydır.

**İndirmeler arası bekleme (ms)** `50`\
Eklentinin her indirmeden sonra sıradaki parçayı istemeden önce ne kadar bekleyeceği. 0, bağlantının izin verdiği en yüksek hızla yükler; daha yüksek değerler indirmeleri zamana yayar ve diğer işlerin için daha çok bant genişliği bırakır. İndirmeler her zaman tek tek yapılır; YouTube daha uzun beklenmesini isterse ona uyulur.

**Duraklatınca da yüklemeye devam et** `açık`\
Video duraklatılmışken de yükleme sürer. Bir videoyu önceden yüklensin diye bilerek durdurduğunda işe yarar. Kapatırsan video her duraklatıldığında indirme de durur.

**Henüz yüklenmemiş bir yere atlayınca** `yükleneni koru`\
Yükleme her durumda yeni noktadan devam eder. *Yükleneni koru* atlamadan önce yüklenen her şeyi de tutar, böylece bağlantı yokken geri dönebilirsin. *Temizle, yeni noktadan yükle* o belleği hemen boşaltır.

**Oynatıcı da daha fazlasını tutsun** `açık`\
YouTube oynatıcısı normalde kendi tamponunda iki üç dakika tutar. Bu ayar, tarayıcının izin verdiği kadar fazlasını tutmasını sağlar; bellekten oynatma bir sebeple çalışmazsa ikinci bir güvence olur. Bellek limitini değil, tarayıcının video tamponunu kullanır.

#### Bellek

**Bellek limiti (MB)** `500`\
Bir sekmede yüklenen videoların kullanabileceği en fazla bellek. Her şey RAM'de durur ve sekmeyi kapatınca silinir. Limitin hemen altındaki tahmin aşağı yukarı ne kadarının sığdığını gösterir: 500 MB'a yaklaşık 25 dakika 1080p ya da 45 dakika 720p video sığar.

**Bellek limiti dolunca** `ikisi de seçili`\
Yer açmak için nelerin silinebileceği; şu sırayla denenir:

1. Aynı sekmede daha önce izlediğin diğer videolar.
2. Şu anki videonun izlediğin kısımları.

Şu anki videonun henüz izlemediğin kısmı asla silinmez, önceden yüklenen sonraki video da her zaman şu anki videoya yer açar. Seçilen adımlar yeterli yer açmazsa yer açılana kadar yükleme durur.

**Başka bir video açınca** `temizle`\
Aynı sekmede başka bir video açtığında ya da bir videodan çıkıp bir dakika geçtiğinde bellekteki videoya ne olacağı. *Temizle* belleği boşaltır. *Son videoları tut* son birkaç videoyu saklar, böylece bağlantı yokken onlara geri dönebilirsin.

**Tutulacak video sayısı** `2`\
*Son videoları tut* seçiliyken görünür. İzlediğin video dahil bellekte kaç video kalacağı. Hepsi bellek limitini paylaşır; ne kadar çok video tutarsan her birine o kadar az yer düşer.

#### Bağlantı kopunca

**Sayfa yenilenince de oynatmaya devam et** `açık`\
Bağlantı yokken sayfayı yenilersen YouTube açılamaz; ya tarayıcının hata sayfası ya da YouTube'un kendi "İnternete bağlanın" sayfası gelir. Bu ayar açıkken eklenti o sekmede kendi sade oynatıcısını açar ve videoyu kaldığın yerden, yüklenen kısmın sonuna kadar oynatır. Bağlantı gelince tek tıkla YouTube'a dönersin; yüklenen kısım da seninle gelir, hiçbir şeyin yeniden indirilmesi gerekmez.

Bunu yapabilmek için eklenti yüklenen videonun ikinci bir kopyasını kendi belleğinde tutar, bu yüzden bellek kullanımı neredeyse iki katına çıkabilir. Kopya da yalnızca RAM'de durur, diske dokunmaz ve bellek limitini aşmaz.

**Kopya izlediğin kısımları bıraksın** `kapalı`\
Üstteki ayar açıkken görünür. Kopyada izlediğin yerin yalnızca son birkaç dakikasını tutarak bellekten tasarruf eder. Bedeli şu: sayfayı yeniledikten sonra yalnızca o kadar geri sarabilirsin, YouTube'a dönünce de daha eski kısımların yeniden indirilmesi gerekir. Kapalıyken kopya, bellek limiti dolana kadar her şeyi tutar.

**Geride tutulacak dakika** `2`\
Üstteki ayar açıkken kopyanın izlediğin yerden geriye doğru ne kadarını saklayacağı.

**Kontrol aralığı (saniye)** `10`\
Bağlantı yokken eklentinin bağlantının gelip gelmediğini ne sıklıkla kontrol edeceği. İlk kontrol bağlantı koptuktan iki saniye sonra yapılır; bağlantı gelir gelmez yükleme devam eder.

**Bağlantı bildirimleri** `açık`\
Bağlantı koptuğunda bellekten daha ne kadar oynatılabileceğini, geri geldiğinde de bunu oynatıcının üstünde kısa bir bildirimle gösterir.

**Bellekteki kısım bitmeden uyar (saniye)** `30`\
Bağlantı yokken oynatma yüklenen kısmın sonuna bu kadar saniye kala bir uyarı gösterir; böylece video durduğunda şaşırmazsın. 0 uyarıyı kapatır.

#### Sonraki video

**Sonraki videoyu da yükle** `açık`\
Bir video bitmeden birkaç saniye önce YouTube sıradakini yüklemeye başlar. O andan itibaren eklenti de onu belleğe alır; böylece sıradaki video da bir kesintiyi atlatabilir. Bu yalnızca bağlantı geçişten sonra koparsa işe yarar, çünkü bağlantı yokken YouTube yeni sayfayı açamaz.

**Hangi video sonraki sayılsın** `ikisi de (önce liste)`\
Oynatma listesinde sonraki video, listedeki bir sonraki videodur. Liste dışında ise otomatik oynatmanın açmak üzere olduğu videodur. Eklentinin ikisini de mi, yalnızca birini mi yükleyeceğini seç.

**Sonraki videonun ne kadarı** `yalnızca ilk dakikaları`\
*Tamamı* sonraki videonun hepsini yükler ve çok bellek harcar. *Yalnızca ilk dakikaları* sadece başını yükler; bu, geçişten hemen sonraki bir kesintiyi atlatmaya yeter. Videonun geri kalanı onu izlemeye başlayınca her zamanki gibi yüklenir.

**Sonraki videonun ilk kaç dakikası** `5`\
*Yalnızca ilk dakikaları* seçiliyken sonraki videonun başından itibaren ne kadarının önceden yükleneceği.

#### Görünüm

**Bellekteki kısmı ilerleme çubuğunda göster** `açık`\
Yüklenen kısmı YouTube'un ilerleme çubuğunda, YouTube'un kendi yüklediği gri kısmın üstünde renkli gösterir. Bağlantı yokken nereye kadar izleyebileceğini ya da atlayabileceğini bir bakışta görürsün.

**Renk** `#3ea6ff`\
Yüklenen kısmın ilerleme çubuğundaki rengi.

**Yüklenme yüzdesini göster** `açık`\
Oynatıcı kontrolleri görünürken videonun ne kadarının bellekte olduğunu ilerleme çubuğunun hemen üstünde gösterir.

**Tamamen yüklenince bildir** `açık`\
Videonun tamamı belleğe alındığında oynatıcının üstünde kısa bir bildirim gösterir.

#### Gelişmiş

**Debug modu** `kapalı`\
Tarayıcı konsoluna ayrıntılı log yazar: DevTools'u aç, Console sekmesine geç ve `[ytbuffy]` ile başlayan satırlara bak. Bir şey çalışmadığında nedenini görmek ya da hata bildirmek için aç.

**Tarayıcı video tampon sınırı (MB)** `150` ve **Tarayıcı ses tampon sınırı (MB)** `12`, Firefox'ta `20`\
Tarayıcının bir oynatıcıya izin verdiği en fazla video ve ses tamponu. Bu değerleri yalnızca *Oynatıcı da daha fazlasını tutsun* kullanır. Tarayıcının sınırlarını [aşağıda](#daha-büyük-bir-oynatıcı-tamponu) anlatıldığı gibi yükseltmediysen olduğu gibi bırak.

**Ayarları dışa aktar** ve **Ayarları içe aktar**\
Tüm ayarlarını metin olarak kopyalayıp saklayabilir ya da başka bir bilgisayara taşıyabilir, sonra geri yapıştırabilirsin. Yapıştırdığın metinde olmayan ayarlar şimdiki değerlerini korur.

**Varsayılana dön**\
Tüm ayarları kurulumdan hemen sonraki hâline döndürür.

### Popup butonu

Popup'taki buton duruma göre değişir:

- **Yüklemeyi başlat:** yükleme henüz başlamadıysa, örneğin *yalnızca butonla* seçiliyken.
- **Yüklemeyi duraklat:** eklenti indirme yaparken. Duraklatmak yalnızca indirmeyi durdurur; bellekte olan kısım oynamaya devam eder.
- **Yüklemeye devam et:** duraklattıktan sonra.

### Sayfa yenilendikten sonra açılan oynatıcı

Bağlantı yokken sayfayı yenilediğinde video eklentinin kendi oynatıcısında açılır. Yüklenen kısım içinde ileri geri sarabilir, tam ekrana geçebilir ve alışık olduğun kısayolları kullanabilirsin: oynatıp durdurmak için Boşluk ya da K, atlamak için J ile L ya da ok tuşları, tam ekran için F, sesi kapatmak için M. Bağlantı gelince **YouTube'a dön** videoyu YouTube'da aynı saniyeden açar.

### Daha büyük bir oynatıcı tamponu

Her oynatıcının tamponunu tarayıcı sınırlar: Chrome ve Chromium tabanlı diğer tarayıcılarda 150 MB video ve 12 MB ses, Firefox'ta 150 MB video ve 20 MB ses. Bellekten oynatma bundan etkilenmez, ama *Oynatıcı da daha fazlasını tutsun* etkilenir.

**Chrome, Edge, Opera, Opera GX, Brave, Vivaldi ve Yandex Browser.** Tarayıcıyı tamamen kapat, sonra şu bayraklarla başlat:

```
--mse-video-buffer-size-limit-mb=1024 --mse-audio-buffer-size-limit-mb=96
```

Windows'ta program Chrome için `chrome.exe`, Edge için `msedge.exe`, Opera ve Opera GX için `opera.exe`, Brave için `brave.exe`, Vivaldi için `vivaldi.exe`, Yandex Browser için de `browser.exe`. Örneğin:

```
chrome.exe --mse-video-buffer-size-limit-mb=1024 --mse-audio-buffer-size-limit-mb=96
```

**Firefox.** `about:config` sayfasında `media.mediasource.eviction_threshold.video` ve `media.mediasource.eviction_threshold.audio` değerlerini ayarla. Değerler bayt cinsindendir: `1073741824` 1024 MB, `100663296` de 96 MB eder.

Sonra **Gelişmiş** bölümüne aynı miktarları MB olarak gir.

### Uykuya alınan sekmeler

Tarayıcılar bellekten tasarruf etmek için arka plandaki sekmeleri uykuya alabilir. Uykuya alınan sekme yüklenen kısmı kaybeder, bu yüzden YouTube'u uyanık tut:

- **Chrome:** `chrome://settings/performance` sayfasında **Her zaman etkin kalacak siteler** bölümündeki **Ekle**'ye tıkla ve `youtube.com` ekle.
- **Edge:** `edge://settings/system/managePerformance` sayfasında **Bu siteleri her zaman etkin tut** satırındaki **Site ekle**'ye tıkla ve `youtube.com` ekle.
- **Brave:** `brave://settings/system` sayfasında **Her zaman etkin kalacak siteler** bölümündeki **Ekle**'ye tıkla ve `youtube.com` ekle.
- **Opera:** ayarlarda *uyku* diye ara ve **Hafızadan tasarruf etmek için etkin olmayan sekmeleri uyku moduna al** seçeneğini kapat.
- **Opera GX:** aynısını yap, **Sistem bellek kullanımı yüksek olduğunda etkin olmayan sekmeleri uykuya al** seçeneğini de kapat. GX Control'deki RAM sınırlayıcıyı kullanıyorsan eklentinin bellek limitine yer bırak; yüklenen video da tarayıcının bellek kullanımına sayılır.
- **Vivaldi:** bir sekmeyi uyku moduna almak onu bellekten çıkarır; izlediğin sekmeyi uyutma.
- **Yandex Browser:** YouTube sekmeleri uykuya alınıyorsa `browser://settings/system` sayfasında **Kullanılmayan sekmeleri uyku moduna al** seçeneğini kapat.
- **Firefox:** arka plandaki sekmeleri yalnızca bilgisayarın belleği azaldığında kapatır.

## Gizlilik

- Video verisi yalnızca bellekte tutulur, diske asla yazılmaz.
- YouTube dışında hiçbir yere hiçbir şey gönderilmez.
- Ayarlar tarayıcının yerel eklenti deposunda tutulur, eşitlenmez.

Chrome ve Chromium tabanlı diğer tarayıcılarda eklenti üç izin ister: ayarların için `storage`, sayfa yenileme için tutulan kopya için `offscreen`, bağlantı yüzünden başarısız olan bir yenilemeyi fark etmek için de `webNavigation`. Firefox'ta offscreen belgeleri olmadığı için orada `storage`, `webNavigation` ve `www.youtube.com` erişimi istenir; Firefox manifesti de eklentinin hiçbir veri toplamadığını bildirir.

## Sınırlar

- Canlı yayınlar desteklenmez.
- Bağlantı yokken başka bir videoya geçemezsin, çünkü YouTube bağlantı olmadan yeni sayfa açamaz.
- Sayfa yenilendikten sonra açılan oynatıcı YouTube sayfası değildir; orada yorum, öneri ya da altyazı yoktur.
- SABR belgelenmemiş bir protokoldür. YouTube onu değiştirirse eklenti güncellenene kadar çalışmayabilir.
- Windows'ta Chrome 158, Edge 158, Firefox 160, Opera 140, Opera GX 139, Brave 1.100, Vivaldi 8.3 ve Yandex Browser 26.10 üzerinde test edildi.

## Geliştirme

```bash
npm test                  # birim ve akış testleri
npm run build             # her tarayıcıyı dist/<tarayıcı> klasörüne derler
npm run build -- firefox  # tek bir tarayıcıyı derler
npm run watch -- chrome   # her değişiklikte tek bir tarayıcıyı yeniden derler
npm run release           # her tarayıcıyı derler ve her birini release/ klasörüne ayrı zip'ler
```

| Klasör | İçinde ne var |
| --- | --- |
| `src/page` | YouTube sayfasının içinde çalışan çekirdek: istek kancaları, SABR ve UMP çözümleme, bellekteki önbellek, önceden yükleme ve bellekten sunma |
| `src/content` | Eklentiyle bağlantı ve oynatıcının üstündeki katmanlar |
| `src/background` | `main.js`: başarısız bir yenilemeden sonra oynatıcıyı açan service worker; `firefox.js`: bunun Firefox karşılığı, sayfa yenileme kopyasını da o tutar |
| `src/vault` | `main.js`: sayfa yenileme için kopyayı tutan offscreen belgesi; `firefox.js`: Firefox'un arka plan sayfası için aynı depo |
| `src/replay` | Sayfa yenilendikten sonra açılan oynatıcı |
| `src/popup`, `src/options` | Popup ve ayarlar sayfası |
| `src/shared` | Ayarlar, iki dildeki arayüz metinleri ve birkaç ortak fonksiyon |
| `static` | Manifestler (Chromium tabanlı tarayıcılar için `manifest.json`, Firefox için `manifest.firefox.json`), HTML, CSS ve ikonlar |

Derleme, `process.env.BROWSER` değerini derlediği tarayıcıya göre ayarlar. Chromium tabanlı derlemeler yalnızca birkaç ayar açıklamasındaki tarayıcı adıyla birbirinden ayrılır. Firefox derlemesi kendi manifestini, arka planını ve deposunu kullanır; sayfa da video verisini eklentiye base64 metin olarak gönderir, çünkü Firefox sayfanın belleğini eklentininkinden ayrı tutar.

## Lisans

YTBUFFY, [GNU Affero Genel Kamu Lisansı v3.0](LICENSE) ile yayımlanmaktadır.


## Sorumluluk Reddi (Disclaimer)

**ÖNEMLİ: BU YAZILIMI İNDİRMEDEN, DERLEMEDEN, KURMADAN VEYA KULLANMADAN ÖNCE LÜTFEN DİKKATLİCE OKUYUN.**

Bu yazılım (**YTBUFFY**), açık, zımni, yasal veya başka türlü hiçbir garanti, beyan veya koşul olmaksızın, tüm kusurlarıyla birlikte kesinlikle **"OLDUĞU GİBİ" ("AS IS")** ve **"MEVCUT OLDUĞU ŞEKLİYLE" ("AS AVAILABLE")** sunulmaktadır. Yürürlükteki yasaların izin verdiği azami ölçüde; yazar(lar), geliştirici(ler)/sürdürücü(ler) ve katkıda bulunanlar; **ticari elverişlilik**, **belirli bir amaca uygunluk**, **mülkiyet hakkı**, **müdahalesiz kullanım**, **hak ihlali bulunmaması**, **doğruluk**, **eksiksizlik**, **güvenilirlik**, **güvenlik** ve **kesintisiz veya hatasız çalışma** dahil ancak bunlarla sınırlı olmamak üzere tüm zımni garantileri ve koşulları açıkça reddeder.

Yazar(lar), geliştirici(ler) veya katkıda bulunanlar tarafından verilen hiçbir sözlü veya yazılı bilgi, dokümantasyon, README açıklaması veya tavsiye; herhangi bir garanti oluşturmaz ve yürürlükteki yasalar kapsamında hariç tutulamayan sorumlulukların kapsamını genişletmez.


### Projenin Amacı ve Teknik Kapsam
YTBUFFY; kararsız, kesintili veya kopan ağ bağlantıları sırasında istemci taraflı (client-side) medya önbellekleme/tamponlama davranışını incelemek amacıyla oluşturulmuş bağımsız ve deneysel bir tarayıcı uzantısıdır. Bir kullanıcı kısa süreli veya tekrarlayan bağlantı kesintileri yaşadığında standart oynatıcı önbellekleri hızla tükenebilir; bu proje, bağlantı dalgalandığında halihazırda yüklenmiş kısımların oynatılmasının daha az kesintiye uğraması için aktif bir oturum sırasında önceden istenen medya parçalarının geçici tarayıcı belleğinde (RAM) nasıl tutulabileceğini araştırmaktadır.

Bu proje; yazılım mühendisliği merakı, kişisel deneyler ve tarayıcı uzantı API'leri, medya kaynağı tamponlama (Media Source Buffering) ve akış protokolleri (SABR/UMP gibi) üzerine teknik araştırma amacıyla geliştirilmiştir. Ticari bir hizmet, yönetilen bir platform, kurumsal bir ürün, korsanlık aracı, erişim engeli aşma aracı veya toplu dağıtım sistemi olarak **sunulmamaktadır**.

### Üçüncü Taraflarla Bağlantı, Onay veya İlişki Bulunmaması
Yazar(lar)ın, geliştirici(ler)in veya katkıda bulunanların; **YouTube**, **Google LLC**, **Alphabet Inc.**, herhangi bir tarayıcı sağlayıcısı (Google, Microsoft, Mozilla, Opera, Brave, Vivaldi veya Yandex dahil) veya bunların bağlı kuruluşları, iştirakleri, lisans verenleri ya da iş ortakları ile hiçbir bağlantısı, ortaklığı, temsilciliği, ortak girişimi, istihdam ilişkisi, sponsorluğu, onayı, sertifikasyonu veya yetkilendirmesi bulunmamaktadır.

Bu depoda veya dokümantasyonda adı geçen tüm ürün adları, ticari markalar, hizmet markaları, ticari unvanlar, logolar ve şirket adları ilgili sahiplerinin mülkiyetindedir. Üçüncü taraf platformlardan, tarayıcılardan, protokollerden veya araçlardan bahsedilmesi yalnızca teknik tanımlama, uyumluluk bağlamı veya birlikte çalışabilirlik açıklaması içindir ve sahipleri tarafından onaylandığı ya da onlarla bir ilişki bulunduğu anlamına **gelmez**.

### Telif Hakkı, Fikri Mülkiyet ve İçerik Lisansı Verilmemesi
Yazar(lar), geliştirici(ler) ve katkıda bulunanlar; YouTube gibi üçüncü taraf hizmetler aracılığıyla erişilen, yüklenen, tamponlanan veya oynatılan hiçbir video, ses akışı, altyazı, küçük resim (thumbnail), üst veri (metadata), medya varlığı, web sayfası veya platform materyali üzerinde herhangi bir mülkiyet, telif hakkı, ticari marka, veritabanı hakkı veya fikri mülkiyet hakkı **iddia etmemektedir**.

Üçüncü taraf medya içeriklerindeki tüm telif hakları, bağlantılı haklar, icra hakları, lisanslar ve diğer fikri mülkiyet hakları münhasıran ilgili içerik üreticilerine, hak sahiplerine, lisans verenlere ve platform operatörlerine aittir. **Bu depodaki veya kaynak kodundaki hiçbir şey; telif hakkıyla korunan veya korumalı herhangi bir eseri indirme, kopyalama, sökme (rip), arşivleme, kalıcı olarak depolama, yeniden dağıtma, yayınlama, kamuya iletme, gelir elde etme veya başka bir şekilde istismar etme konusunda hiçbir lisans, izin veya hak vermez, devretmez, bunlardan feragat etmez ve bunları ima etmez.**

### Korumaları Aşmama Amacı ve İçerik Üreticileri ile Platformlara Saygı
Bu proje; ödeme duvarlarını aşmak, erişim kontrollerini devre dışı bırakmak, teknik koruma önlemlerini atlatmak, hesap yetkilerini değiştirmek, abonelikleri taklit etmek, izinsiz reklam eklemek, analitik/telemetri verilerini engellemek veya manipüle etmek ya da içerik üreticilerinin, platformların, reklamverenlerin veya hak sahiplerinin meşru gelirlerine, reklam sistemlerine, sponsorluklarına veya iş modellerine zarar vermek üzere tasarlanmamıştır ve bu amacı taşımaz.

İçerik üreticileri eserlerini ortaya koymak için ciddi zaman, emek ve kaynak harcamakta; platformlar ise kendi teknik mimarileri ve kuralları çerçevesinde faaliyet göstermektedir. Bu yazılımın üçüncü taraf Hizmet Şartlarını, platform kurallarını, hız sınırlarını (rate limits), sözleşmeden doğan yükümlülükleri veya yürürlükteki yasaları ihlal edecek şekilde kötüye kullanılması kesinlikle bu projenin amacının dışındadır ve sorumluluğu tamamen kullanıcıya aittir.

### Geçici Bellek Davranışı, Sunucu Bulunmaması ve Kalıcı Depolama İddiası Olmaması
Dokümantasyonda açıklandığı üzere YTBUFFY; yazar(lar) tarafından işletilen harici arka uç sunucuları, aktarma vekilleri (relay proxy) veya bulut depolama alanları olmaksızın, aktif bir oturum sırasında geçici bellek (RAM) kullanarak kullanıcının tarayıcı ortamında yerel olarak çalışır. Proje, uzantının kendi mantığı aracılığıyla kalıcı medya dosyaları yazmak yerine medya parçalarını geçici bellekte tutacak şekilde tasarlanmış olsa da; belirli bir tarayıcının, işletim sisteminin, uzantı çalışma zamanının, sayfa yenileme işleyicisinin, bellek ayırıcısının, takas dosyasının (swap file), hazırda bekletme (hibernation) durumunun, çökme dökümünün (crash dump) veya üçüncü taraf bir aracın uygulamada belleği nasıl yönettiği, disk sayfalarına yazdığı, önbelleğe aldığı veya temizlediği konusunda **hiçbir teknik garanti veya teminat verilmemektedir**.

Belirli bir makinede veya işletim sisteminde mutlak gizlilik, hassas medya işleme, yasal düzenlemelere tabi veri kontrolleri veya kalıcı olmama garantisi gerektiren kullanıcılar; tarayıcılarında herhangi bir üçüncü taraf veya açık kaynak kodu çalıştırmanın kendi gereksinimlerini karşılayıp karşılamadığını değerlendirmekten münhasıran sorumludur.

### Protokol Değişiklikleri, İşlev Kaybı ve Uyumluluk Riskleri
Akış protokolleri, web oynatıcı iç yapıları, tarayıcı uzantı API'leri ve güvenlik politikaları sık sık ve çoğu zaman önceden bildirilmeksizin değişmektedir. Akış formatları ve belgelenmemiş veya gelişmekte olan davranışlar (SABR/UMP gibi) üçüncü taraflarca tek taraflı olarak değiştirilebileceğinden, YTBUFFY herhangi bir zamanda bozulabilir, hatalı çalışabilir, durabilir, tamponlanmış verileri kaybedebilir, farklı tarayıcı sürümlerinde veya işletim sistemlerinde tutarsız davranabilir ya da tamamen işlevsiz hale gelebilir.

Yazar(lar)ın, geliştirici(ler)in ve katkıda bulunanların bu yazılımı sürdürme, güncelleme, yama yayınlama, destek sağlama, hatalarını giderme veya herhangi bir tarayıcı, işletim sistemi ya da üçüncü taraf web sitesi ile sürekli uyumluluğunu garanti etme konusunda **hiçbir yükümlülüğü yoktur**.

### Kullanıcının Tek Başına Sorumluluğu ve Yasal Uyumluluk
Bu yazılımı indirerek, klonlayarak, derleyerek, değiştirerek, kurarak, etkinleştirerek veya kullanarak; eylemlerinizin ve bunların sonuçlarının **tek ve tam sorumluluğunu üstlenmiş olursunuz**.

YTBUFFY kullanımınızın bulunduğunuz yargı yetkisi alanında ve geçerli sözleşmeler kapsamında yasal ve izin verilebilir olup olmadığını belirlemekten münhasıran siz sorumlusunuz; buna aşağıdakiler dahildir:
- Yerel, ulusal ve uluslararası telif hakkı, fikri mülkiyet, bilişim suçları ve veri koruma yasaları;
- Üçüncü taraf Hizmet Şartları, Kabul Edilebilir Kullanım Politikaları ve platform kuralları (YouTube Hizmet Şartları ve tarayıcı mağazası/uzantı politikaları dahil);
- Tarayıcının kullanıldığı kurumsal, iş yeri, okul veya ağ politikaları; ve
- Cihazınızdaki veri kullanımı, bant genişliği kotaları, pil/ısınma etkisi ve sistem bellek sınırları.

Bu yazılımı kullanmanız yürürlükteki yasalar veya uymakla yükümlü olduğunuz kurallar tarafından yasaklanmışsa, yazılımı indirmemeli, kurmamalı ve kullanmamalısınız.

### Sorumluluk Sınırlaması ve Tazminat
Yürürlükteki yasaların izin verdiği en geniş ölçüde; yazar(lar), geliştirici(ler) veya katkıda bulunanlar hiçbir durumda size veya herhangi bir üçüncü tarafa karşı; sözleşme, haksız fiil, ihmal, kusursuz sorumluluk, yasal görev veya başka bir hukuki teoriye dayanıp dayanmadığına bakılmaksızın ve bu tür zararların olasılığı bildirilmiş, biliniyor veya bilinmesi gerekmiş olsa dahi, bu yazılıma erişim, indirme, derleme, değiştirme, kurulum, çalıştırma, performans, arıza veya yazılımı kullanamamadan kaynaklanan ya da bunlarla herhangi bir şekilde bağlantılı olan aşağıdakiler dahil ancak bunlarla sınırlı olmamak üzere hiçbir **doğrudan, dolaylı, arızi, özel, netice kabilinden doğan, emsal niteliğindeki veya cezai zarardan** ya da herhangi bir türdeki kayıp veya hasardan sorumlu tutulamaz:
- Kâr, gelir, iş, sözleşme veya beklenen tasarruf kaybı;
- Reklam, sponsorluk, içerik üreticisi veya ticari gelir kaybı;
- Veri veya oturum durumunun kaybı, bozulması, ifşa olması veya kalıcı olmaması;
- Üçüncü taraflarca uygulanan hesap uyarıları, kısıtlamalar, askıya almalar, yasaklamalar veya IP/ağ engellemeleri;
- Aşırı internet veri kullanımı, kotalı bant genişliği ücretleri, donanım yıpranması, sistem yavaşlamaları, tarayıcı çökmeleri veya sekme/bellek tükenmesi; veya
- İtibar ya da şerefiye kaybı.

Yürürlükteki yasaların belirli garanti veya sorumlulukların hariç tutulmasına ya da sınırlandırılmasına izin vermediği durumlarda, yazar(lar)ın, geliştirici(ler)in ve katkıda bulunanların sorumluluğu **yasaların izin verdiği en dar asgari ölçü ile** sınırlandırılacaktır.

Yasaların izin verdiği ölçüde; bu yazılımı kötüye kullanmanızdan, herhangi bir yasayı, üçüncü taraf hakkını veya şartını ihlal etmenizden ya da kodu değiştirmenizden veya yeniden dağıtmanızdan kaynaklanan veya bunlarla ilgili olan her türlü iddia, talep, dava, yargılama, yükümlülük, zarar, kayıp, para cezası, yaptırım, masraf ve harcamaya (makul avukatlık ücretleri dahil) karşı yazar(lar)ı, geliştirici(ler)i ve katkıda bulunanları savunmayı, tazmin etmeyi ve zarar görmemelerini sağlamayı kabul edersiniz.

### Açık Kaynak Lisans İlişkisi
Bu sorumluluk reddi metni; garanti reddi ve sorumluluk sınırlamalarının ilgili lisansta ve yürürlükteki yasalarda izin verildiği ölçüde geçerli olması kaydıyla, bu deponun dağıtıldığı açık kaynak lisansının (**GNU Affero Genel Kamu Lisansı v3.0** gibi) şartlarını tamamlar; bunları değiştirmez veya bunların yerine geçmez. Bu sorumluluk reddi beyanının herhangi bir hükmünün yürürlükteki yasalar uyarınca geçersiz veya uygulanamaz sayılması halinde, kalan hükümler tam olarak yürürlükte kalmaya devam edecektir.
- **Eğitim ve Araştırma Amaçlı Kullanım:** Bu proje yalnızca eğitim, kişisel deney ve tarayıcı eklentisi mimarisini anlamak amacıyla tasarlanmıştır.
- **Uyumluluk:** Yayıncı; üçüncü taraf hizmet şartlarının, platform yönergelerinin veya telif hakkı politikalarının ihlal edilmesini onaylamaz veya teşvik etmez. Kullanıcılar, bu yazılımı kendi kullanım biçimlerinden tamamen sorumludur.
- **Sorumluluk Sınırlandırması:** Hiçbir koşulda yayıncı, bu yazılımın kullanımından veya dağıtımından kaynaklanan herhangi bir hak iddia, zarar veya yükümlülükten sorumlu tutulamaz.
