<p align="center">
  <img src="assets/social-preview.png" alt="YTBUFFY" width="720">
</p>

<p align="center"><a href="README.md">English</a> · <b>Türkçe</b></p>

# YTBUFFY

YouTube videolarını önceden belleğe yükleyen bir Chrome eklentisi. Bağlantın koptuğunda video oynamaya devam eder.

YouTube oynatıcısı yalnızca iki üç dakika ilerisini yükler; bağlantısı sık sık kopan biri için bu bir kesintiyi atlatmaya yetmez. YTBUFFY videoyu arka planda indirmeye devam eder ve oynatıcıyı bellekten besler. Böylece bağlantı olsa da olmasa da video, yüklenen kısmın sonuna kadar oynar.

## Özellikler

- **Kesintilerde oynamaya devam eder.** Video yüklenen kısmın sonuna kadar sürer, bu kısım içinde ileri geri de sarabilirsin.
- **Sayfa yenilense de durmaz.** Bağlantı yokken F5'e basarsan video eklentinin kendi oynatıcısında kaldığın yerden devam eder.
- **Yalnızca bellek.** Diske hiçbir şey yazılmaz; sekmeyi kapatınca her şey silinir.
- **Sunucu yok.** Eklenti yalnızca YouTube ile konuşur ve YouTube oynatıcısının kendi yaptığı istekleri kullanır. YouTube'un imza ve şifreleme koduna hiç dokunmaz.
- **Neyin yüklendiğini görürsün.** Yüklenen kısım ilerleme çubuğunda işaretlenir.
- **İngilizce ve Türkçe arayüz.**

## Kurulum

YTBUFFY Chrome Web Mağazası'nda yok; paketlenmemiş eklenti olarak yüklenir.

### Hazır sürümden

1. [Releases](https://github.com/lilbatus/ytbuffy/releases) sayfasından en son `ytbuffy-vX.Y.Z.zip` dosyasını indir ve bir klasöre çıkar.
2. `chrome://extensions` sayfasını aç ve sağ üstteki **Geliştirici modu**nu aç.
3. **Paketlenmemiş öğe yükle**'ye tıkla ve çıkardığın klasörü seç.
4. Açık olan YouTube sekmelerini yenile.

Güncellemek için yeni sürümü aynı klasöre, eski dosyaların üzerine çıkar ve eklentinin kartındaki yenile simgesine bas. Klasörün yerini değiştirmezsen ayarların korunur.

### Kaynaktan derleyerek

[Node.js](https://nodejs.org) 20 veya daha yeni bir sürüm gerekir.

```bash
git clone https://github.com/lilbatus/ytbuffy.git
cd ytbuffy
npm install
npm run build
```

Sonra `dist` klasörünü aynı şekilde yükle. Güncellemek için son değişiklikleri çek, `npm run build` komutunu yeniden çalıştır ve yenile simgesine bas.

## Kullanım

Bir video açtığında eklenti kendiliğinden çalışmaya başlar. İlerleme çubuğundaki mavi kısım, bellekte hazır olan bölümdür.

- **Popup:** eklentiyi aç ya da kapat, videonun ne kadarının yüklendiğini ve ne kadar bellek kullanıldığını gör, yüklemeyi başlat, duraklat ya da devam ettir.
- **Ayarlar:** her seçenek sayfanın kendisinde açıklanır. Arayüz dilini sağ üstteki **TR | ENG** ile değiştirebilirsin. Aşağıdaki [Dokümantasyon](#dokümantasyon) bölümü her ayarı daha ayrıntılı anlatır.

## Nasıl çalışır

YouTube'un web oynatıcısı videoyu belgelenmemiş bir protokol olan SABR ile çeker. YTBUFFY, oynatıcının kendi isteklerini şablon olarak alır ve videonun sonraki kısımlarını bunlarla belleğe indirir. Oynatıcı yeni bir parça istediğinde yanıt ağa hiç gitmeden doğrudan bellekten gelir. Bu yüzden bağlantı koptuğunda, yüklenen kısım bitene kadar oynatıcı bunu fark etmez.

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
Her videoyu seçtiğin kalitede oynatır ve o kalitede yükler. Kapalıyken kaliteyi video başlarken YouTube seçer ve video sonuna kadar o kalitede kalır; çünkü video bellekten oynarken YouTube kaliteyi değiştiremez. Her seferinde aynı kaliteyi istiyorsan ya da bir videonun ne kadar bellek ve internet harcayacağını kontrol etmek istiyorsan kalite kilitle.

**Videoda o kalite yoksa** `en yakın alt kalite`\
Her video her kalitede bulunmaz. Bellekten ve internetten tasarruf için en yakın alt kaliteyi, daha net görüntü için en yakın üst kaliteyi seç.

**Kalite değişikliğini takip et** `açık`\
Kaliteyi YouTube'un dişli menüsünden kendin değiştirdiğinde eski kalitede yüklenen kısım silinir ve yükleme bulunduğun yerden yeni kalitede yeniden başlar. Kapatırsan video yüklendiği kalitede oynamaya devam eder; seçtiğin kalite yalnızca henüz bellekte olmayan kısımlarda geçerli olur.

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
Bağlantı yokken sayfayı yenilersen YouTube açılamaz; ya Chrome'un hata sayfası ya da YouTube'un kendi "İnternete bağlanın" sayfası gelir. Bu ayar açıkken eklenti o sekmede kendi sade oynatıcısını açar ve videoyu kaldığın yerden, yüklenen kısmın sonuna kadar oynatır. Bağlantı gelince tek tıkla YouTube'a dönersin; yüklenen kısım da seninle gelir, hiçbir şeyin yeniden indirilmesi gerekmez.

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

**Tarayıcı video tampon sınırı (MB)** `150` ve **Tarayıcı ses tampon sınırı (MB)** `12`\
Chrome'un bir oynatıcıya izin verdiği en fazla video ve ses tamponu. Bu değerleri yalnızca *Oynatıcı da daha fazlasını tutsun* kullanır. Chrome'u [aşağıda](#daha-büyük-bir-oynatıcı-tamponu) anlatılan bayraklarla başlatmıyorsan olduğu gibi bırak.

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

Chrome her oynatıcının tamponunu 150 MB video ve 12 MB ses ile sınırlar. Bellekten oynatma bundan etkilenmez, ama *Oynatıcı da daha fazlasını tutsun* etkilenir. Sınırları yükseltmek için Chrome tamamen kapalıyken onu şu bayraklarla başlat:

```
chrome.exe --mse-video-buffer-size-limit-mb=1024 --mse-audio-buffer-size-limit-mb=96
```

Sonra **Gelişmiş** bölümüne aynı değerleri gir.

### Bellek Tasarrufu

Chrome'un Bellek Tasarrufu özelliği arka plandaki bir sekmeyi kapatırsa o sekmenin kullandığı bellek de gider. Bunu önlemek için `chrome://settings/performance` sayfasında **Bu siteleri her zaman etkin tut** listesine `youtube.com` ekle.

## Gizlilik

- Video verisi yalnızca bellekte tutulur, diske asla yazılmaz.
- YouTube dışında hiçbir yere hiçbir şey gönderilmez.
- Ayarlar `chrome.storage.local` ile yalnızca bu bilgisayarda saklanır, eşitlenmez.

Eklenti üç izin ister: ayarların için `storage`, sayfa yenileme için tutulan kopya için `offscreen`, bağlantı yüzünden başarısız olan bir yenilemeyi fark etmek için de `webNavigation`.

## Sınırlar

- Canlı yayınlar desteklenmez.
- Bağlantı yokken başka bir videoya geçemezsin, çünkü YouTube bağlantı olmadan yeni sayfa açamaz.
- Sayfa yenilendikten sonra açılan oynatıcı YouTube sayfası değildir; orada yorum, öneri ya da altyazı yoktur.
- SABR belgelenmemiş bir protokoldür. YouTube onu değiştirirse eklenti güncellenene kadar çalışmayabilir.
- Chrome 156 üzerinde geliştirildi ve test edildi.

## Geliştirme

```bash
npm test        # birim ve akış testleri
npm run build   # eklentiyi dist/ klasörüne derler
npm run watch   # her değişiklikte yeniden derler
```

| Klasör | İçinde ne var |
| --- | --- |
| `src/page` | YouTube sayfasının içinde çalışan çekirdek: istek kancaları, SABR ve UMP çözümleme, bellekteki önbellek, önceden yükleme ve bellekten sunma |
| `src/content` | Eklentiyle bağlantı ve oynatıcının üstündeki katmanlar |
| `src/background` | Başarısız bir yenilemeden sonra oynatıcıyı açan service worker |
| `src/vault` | Sayfa yenileme için kopyayı tutan offscreen belgesi |
| `src/replay` | Sayfa yenilendikten sonra açılan oynatıcı |
| `src/popup`, `src/options` | Popup ve ayarlar sayfası |
| `src/shared` | Ayarlar, iki dildeki arayüz metinleri ve birkaç ortak fonksiyon |
| `static` | Manifest, HTML, CSS ve ikonlar |

## Lisans

YTBUFFY, [GNU Affero Genel Kamu Lisansı v3.0](LICENSE) ile yayımlanmaktadır.


## Yasal Uyarı

Bu yazılım, açık veya zımni herhangi bir garanti olmaksızın "olduğu gibi" sağlanmaktadır.
- **Eğitim ve Araştırma Amaçlı Kullanım:** Bu proje yalnızca eğitim, kişisel deney ve tarayıcı eklentisi mimarisini anlamak amacıyla tasarlanmıştır.
- **Uyumluluk:** Yayıncı; üçüncü taraf hizmet şartlarının, platform yönergelerinin veya telif hakkı politikalarının ihlal edilmesini onaylamaz veya teşvik etmez. Kullanıcılar, bu yazılımı kendi kullanım biçimlerinden tamamen sorumludur.
- **Sorumluluk Sınırlandırması:** Hiçbir koşulda yayıncı, bu yazılımın kullanımından veya dağıtımından kaynaklanan herhangi bir hak iddia, zarar veya yükümlülükten sorumlu tutulamaz.