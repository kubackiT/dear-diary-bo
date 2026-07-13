# Dear Diary - opis zbierania i przetwarzania danych badawczych

## 1. Cel modułu badawczego

Aplikacja Dear Diary jest aplikacją dziennika/notatnika, która pełni rolę środowiska do naturalnego zbierania danych o dynamice pisania na klawiaturze. Celem badawczym jest sprawdzenie, czy na podstawie sposobu pisania użytkownika można zbudować jego profil behawioralny, a następnie weryfikować, czy kolejne próbki pisania są zgodne z tym profilem.

Badanie nie polega na analizie treści notatek. Istotne są wyłącznie cechy czasowe i behawioralne związane z obsługą klawiatury, np. czas przytrzymania klawiszy, czas przejścia między klawiszami, pauzy, poprawki oraz rytm wpisywania par klawiszy.

## 2. Główne fazy działania

Moduł badawczy działa w dwóch głównych trybach:

### Enrollment

Tryb `Enrollment` służy do budowania profilu użytkownika. Użytkownik pisze naturalnie w aplikacji, a system zbiera próbki dynamiki pisania. Po osiągnięciu ustawionego progu liczby naciśnięć klawiszy próbka jest zapisywana w bazie jako dane profilujące.

Po zebraniu minimalnej liczby próbek backend może utworzyć profil użytkownika oraz wytrenować model TensorFlow.

### Verification

Tryb `Verification` służy do testowania gotowego profilu. Nowe próbki nie aktualizują już profilu, tylko są porównywane z wcześniej utworzonym modelem użytkownika. Wynikiem jest score zgodności oraz decyzja, czy próbka pasuje do profilu.

Próbki verification mogą być oznaczane jako:

- `owner` - próbkę pisał właściciel profilu,
- `impostor` - próbkę pisała inna osoba na profilu/konto testowym właściciela.

To oznaczenie nie wpływa na działanie modelu. Służy późniejszej analizie wyników, np. do obliczenia FAR, FRR lub accuracy.

## 3. Gdzie odbywa się zbieranie danych

Zbieranie danych z klawiatury odbywa się po stronie frontendu, w serwisie:

```text
dear-diary-app/src/app/_services/keystroke.service.ts
```

Serwis nasłuchuje zdarzeń:

```text
keydown
keyup
```

w polu treści notatki. Każde zdarzenie klawiatury posiada `event.timeStamp`, który jest wykorzystywany do wyliczania cech czasowych. Aplikacja nie zapisuje pełnego logu zdarzeń w postaci `keydown/keyup` dla każdego klawisza. Timestampy są wykorzystywane w locie do obliczenia cech próbki.

Do backendu trafiają już przetworzone wartości, m.in. tablice czasów i statystyki.

## 4. Zbierane cechy

### 4.1. Dwell time

`dwell` oznacza czas przytrzymania klawisza:

```text
dwell = keyup danego klawisza - keydown tego samego klawisza
```

Dla całej próbki liczone są:

```text
mean
median
stdDev
min
max
count
```

### 4.2. Flight / press-press latency

`flight` w aplikacji oznacza czas między naciśnięciem jednego klawisza a naciśnięciem kolejnego:

```text
flight = keydown kolejnego klawisza - keydown poprzedniego klawisza
```

Jest to klasyczna cecha typu `press-press latency`.

Długie przerwy nie są wliczane do `flight`. Jeśli odstęp między klawiszami przekroczy próg `Long pause threshold ms`, jest traktowany jako pauza, a nie jako zwykły czas przejścia między klawiszami.

### 4.3. Release-press latency

`releasePress` oznacza czas między puszczeniem poprzedniego klawisza a naciśnięciem kolejnego:

```text
releasePress = keydown kolejnego klawisza - keyup poprzedniego klawisza
```

Ta wartość może być dodatnia lub ujemna.

Wartość dodatnia oznacza, że użytkownik najpierw puścił poprzedni klawisz, a dopiero potem nacisnął kolejny.

Wartość ujemna oznacza overlap, czyli sytuację, w której użytkownik nacisnął kolejny klawisz przed puszczeniem poprzedniego.

### 4.4. Release-release latency

`releaseRelease` oznacza czas między puszczeniem jednego klawisza a puszczeniem kolejnego:

```text
releaseRelease = keyup kolejnego klawisza - keyup poprzedniego klawisza
```

Ta cecha opisuje rytm kończenia naciśnięć klawiszy i uzupełnia cechy `dwell`, `flight` oraz `releasePress`.

### 4.5. Overlap

`overlapCount` oznacza liczbę przejść między klawiszami, w których `releasePress` było ujemne.

Na backendzie wyliczany jest także:

```text
overlapRate = overlapCount / keyCount
```

Cecha ta opisuje, jak często użytkownik naciska kolejny klawisz zanim puści poprzedni. Może odzwierciedlać płynność i koordynację pisania.

### 4.6. Pauzy

`pause` obejmuje dłuższe przerwy między naciśnięciami klawiszy.

Próg długiej pauzy jest konfigurowalny w panelu admina:

```text
Long pause threshold ms
```

Domyślna wartość:

```text
2000 ms
```

Jeżeli odstęp między kolejnymi `keydown` przekroczy ten próg, nie trafia do `flight`, tylko do `pause`.

Dzięki temu np. chwilowe zatrzymanie się użytkownika, zastanawianie się nad treścią albo odejście od klawiatury nie zaburza średnich czasów przejścia między klawiszami.

### 4.7. Bursty

`burst` oznacza serię pisania między długimi pauzami.

Przykład:

```text
użytkownik pisze 35 klawiszy
długa pauza
użytkownik pisze 18 klawiszy
długa pauza
użytkownik pisze 44 klawisze
```

W takim przypadku próbka ma trzy bursty o długościach:

```text
35, 18, 44
```

Dla burstów liczone są statystyki:

```text
mean
median
stdDev
min
max
count
```

### 4.8. Tempo pisania

Zbierane i wyliczane są także cechy tempa:

```text
keysPerMinute
charsPerMinute
wordsPerMinute
```

Są one wyliczane na podstawie długości próbki i czasu jej trwania.

### 4.9. Poprawki

Aplikacja zlicza użycia klawisza `Backspace`.

Zapisywane są:

```text
correctionCount
correctionRate = correctionCount / keyCount
```

Cecha ta opisuje częstotliwość poprawek wykonywanych podczas pisania.

### 4.10. Digrafy

Digraf oznacza przejście między dwoma kolejnymi klawiszami.

Przykłady:

```text
a>n
n>space
space>t
s>z
```

Frontend zbiera wszystkie digrafy, które wystąpią w danej próbce. Dla każdego digrafu zapisywane są statystyki czasu przejścia `press-press`, czyli:

```text
keydown drugiego klawisza - keydown pierwszego klawisza
```

Dla każdego digrafu liczone są:

```text
mean
median
stdDev
min
max
count
```

Frontend wysyła do backendu wszystkie zarejestrowane digrafy z próbki. Backend dopiero podczas budowy profilu wybiera najczęstsze digrafy z całego zbioru próbek enrollment użytkownika. Liczba digrafów użytych jako cechy modelu jest ustawiana w panelu admina:

```text
Max digraph features
```

Domyślna wartość:

```text
20
```

Jeśli `Max digraph features = 20`, backend wybiera 20 najczęstszych digrafów, a każdy z nich daje dwie cechy:

```text
digraph.x.mean
digraph.x.stdDev
```

## 5. Struktura próbki w bazie danych

Próbki zapisywane są w kolekcji:

```text
trainingdatas
```

Każda próbka zawiera m.in.:

```text
userId
sampleType
actorType
profileVersion
profileFrozen
timestamp
textLength
durationMs
keyCount
correctionCount
wordCount
burstCount
longPauseCount
overlapCount
dwell
flight
releasePress
releaseRelease
pause
burst
digraphs
raw
verification
```

`sampleType` określa, czy próbka służy do budowy profilu, czy do testowania:

```text
enrollment
verification
```

`actorType` jest używane przy próbkach verification:

```text
owner
impostor
```

`raw` zawiera tablice wartości czasowych, np.:

```text
dwellTimes
flightTimes
releasePressTimes
releaseReleaseTimes
pauseTimes
burstLengths
```

`verification` zawiera wyniki weryfikacji, np.:

```text
score
finalScore
decision
isMatch
tensorflowScore
tensorflowError
tensorflowThreshold
statisticalScore
statisticalMatch
```

## 6. Budowa profilu użytkownika

Profil użytkownika jest budowany po stronie backendu w pliku:

```text
app/controllers/trainModel.controller.js
```

Backend bierze próbki:

```text
sampleType = enrollment
```

dla wybranego użytkownika.

Próbki zbyt małe są pomijane. Minimalny rozmiar próbki to obecnie:

```text
250 key events
```

Dodatkowo panel admina posiada ustawienie:

```text
Minimum enrollment samples
```

które określa, ile próbek enrollment jest wymagane, zanim model zostanie uznany za możliwy do trenowania.

### 6.1. Wektor cech

Każda próbka enrollment jest zamieniana na wektor liczbowy.

Podstawowe cechy wektora obejmują:

```text
dwell.mean
dwell.median
dwell.stdDev
flight.mean
flight.median
flight.stdDev
releasePress.mean
releasePress.median
releasePress.stdDev
releaseRelease.mean
releaseRelease.median
releaseRelease.stdDev
pause.mean
pause.median
pause.stdDev
burst.mean
burst.median
burst.stdDev
correctionRate
overlapRate
longPauseRate
keysPerMinute
charsPerMinute
wordsPerMinute
```

Do tego backend dodaje cechy digrafowe dla najczęstszych digrafów użytkownika:

```text
digraph.<para>.mean
digraph.<para>.stdDev
```

### 6.2. Profil statystyczny

Na podstawie wektorów próbek enrollment backend wylicza:

```text
meanVector
stdVector
threshold
featureNames
sampleCount
```

`meanVector` to średni wektor cech użytkownika.

`stdVector` opisuje typową zmienność każdej cechy. Dla części cech stosowane są minimalne wartości odchylenia, żeby profil nie był zbyt wrażliwy na małe różnice wynikające np. z małej liczby próbek.

`threshold` jest progiem bazowym używanym przez prostszy model statystyczny.

Profil statystyczny pełni dwie funkcje:

1. jest baseline do porównania z TensorFlow,
2. dostarcza normalizacji danych wejściowych dla modelu TensorFlow.

## 7. Model TensorFlow

Główny model weryfikacji jest oparty o TensorFlow.

W aplikacji zastosowano autoenkoder.

Autoenkoder jest siecią neuronową, która uczy się odtwarzać na wyjściu ten sam wektor, który otrzymała na wejściu. W kontekście tej aplikacji oznacza to:

```text
model uczy się odtwarzać typowe wektory cech użytkownika
```

### 7.1. Trening

Podczas treningu:

1. Backend pobiera próbki enrollment użytkownika.
2. Zamienia każdą próbkę na wektor cech.
3. Normalizuje wektory z użyciem `meanVector` i `stdVector`.
4. Trenuje autoenkoder TensorFlow.
5. Oblicza błędy rekonstrukcji dla próbek treningowych.
6. Wyznacza próg rekonstrukcji:

```text
reconstructionThreshold = reconstructionMean + 3 * reconstructionStdDev
```

z minimalną wartością bezpieczeństwa.

Wytrenowany model jest zapisywany w dokumencie użytkownika w kolekcji:

```text
users
```

w polu:

```text
modelData
```

Zapisywane są m.in.:

```text
modelTopology
weightSpecs
weightData
featureNames
meanVector
stdVector
reconstructionThreshold
reconstructionMean
reconstructionStdDev
trainedAt
```

### 7.2. Weryfikacja

Podczas verification:

1. Frontend zbiera nową próbkę pisania.
2. Backend zamienia próbkę na wektor cech zgodny z `featureNames` modelu.
3. Wektor jest normalizowany.
4. Autoenkoder próbuje odtworzyć wektor.
5. Backend liczy błąd rekonstrukcji.
6. Błąd jest porównywany z `reconstructionThreshold`.

Jeśli błąd rekonstrukcji jest niski, próbka jest uznawana za podobną do profilu użytkownika.

Jeśli błąd jest wysoki, próbka jest uznawana za odstającą od profilu.

Score jest liczony na podstawie błędu rekonstrukcji:

```text
im mniejszy błąd rekonstrukcji, tym wyższy score
```

## 8. Baseline statystyczny

Oprócz TensorFlow aplikacja zapisuje także wynik prostszego modelu statystycznego.

Baseline działa na zasadzie dystansu od średniego profilu użytkownika:

```text
(value - mean) / std
```

Dzięki temu można porównać:

```text
TensorFlow autoencoder
vs
profil statystyczny
```

To jest istotne badawczo, ponieważ pozwala sprawdzić, czy zastosowanie TensorFlow daje lepsze wyniki niż prostsza metoda oparta o średnie i odchylenia.

Wyniki baseline są zapisywane w próbce verification:

```text
statisticalScore
statisticalMatch
distance
```

## 9. Wynik końcowy weryfikacji

Aplikacja zapisuje trzy poziomy wyniku:

```text
statisticalScore - wynik profilu statystycznego
tensorflowScore - wynik autoenkodera TensorFlow
score / finalScore - wynik końcowy
```

Wynik TensorFlow jest liczony jako płynna miara podobieństwa na podstawie błędu rekonstrukcji:

```text
effectiveThreshold = max(reconstructionThreshold, 0.75)
tensorflowScore = exp(-reconstructionError / effectiveThreshold)
```

Dzięki temu model TensorFlow nie obcina wyniku od razu do 0% po przekroczeniu bardzo niskiego progu rekonstrukcji. Jest to istotne zwłaszcza przy mniejszej liczbie próbek treningowych, gdy autoenkoder może być zbyt rygorystyczny.

Wynik końcowy jest liczony jako kombinacja obu metod:

```text
finalScore = 0.65 * statisticalScore + 0.35 * tensorflowScore
```

Takie podejście pozwala zachować TensorFlow jako element klasyfikacji, ale ogranicza sytuację, w której zbyt rygorystyczny model neuronowy całkowicie zeruje wynik mimo rozsądnego dopasowania statystycznego.

Na podstawie `finalScore` wyznaczana jest decyzja:

```text
finalScore >= 70%      -> match
finalScore 50-69%      -> uncertain
finalScore < 50%       -> mismatch
```

Progi te są progami roboczymi.

## 10. Panel admina

Panel admina umożliwia kontrolę nad procesem badawczym.

### 10.1. Mode

```text
Enrollment
Verification
```

`Enrollment` oznacza zbieranie danych do profilu.

`Verification` oznacza testowanie gotowego profilu.

### 10.2. Profile updates enabled

Określa, czy profil może być aktualizowany nowymi próbkami enrollment.

### 10.3. Profile frozen

Globalna flaga zamrożenia profilu. Pomaga utrzymać rozdział między etapem treningu i testowania.

### 10.4. Minimum enrollment samples

Minimalna liczba próbek wymagana do trenowania profilu.

### 10.5. Enrollment key threshold

Liczba naciśnięć klawiszy potrzebna do utworzenia jednej próbki enrollment.

### 10.6. Verification key threshold

Liczba naciśnięć klawiszy wymagana, zanim system zacznie liczyć score verification.

### 10.7. Verification refresh step

Co ile kolejnych naciśnięć klawiszy score verification jest przeliczany.

### 10.8. Long pause threshold ms

Próg rozdzielający zwykłe przejście między klawiszami od długiej pauzy.

### 10.9. Max digraph features

Liczba najczęstszych digrafów używana jako cechy modelu.

### 10.10. Selected user

Pozwala wybrać użytkownika, którego statystyki i wyniki są wyświetlane.

### 10.11. Current verification actor

Pozwala oznaczyć, kto aktualnie pisze próbki verification dla wybranego profilu:

```text
Owner
Impostor
```

To ustawienie jest zapisywane przy nowych próbkach verification jako `actorType`.

### 10.12. Freeze selected profile

Zamraża profil wybranego użytkownika i przełącza aplikację w tryb verification. Od tego momentu nowe próbki nie powinny douczać profilu, tylko służyć do jego testowania.

## 11. Sugerowany przebieg badania

1. Utworzyć konto testowe użytkownika.
2. Ustawić tryb `Enrollment`.
3. Użytkownik pisze naturalnie w aplikacji.
4. Zebrać wymaganą liczbę próbek enrollment.
5. Zamrozić profil przyciskiem `Freeze selected profile`.
6. Ustawić tryb `Verification`.
7. Zebrać próbki verification pisane przez właściciela profilu (`Owner`).
8. Opcjonalnie zebrać próbki verification pisane przez inną osobę (`Impostor`).
9. Wyeksportować dane z MongoDB.
10. Porównać wyniki TensorFlow i baseline statystycznego.

## 12. Możliwe wyniki do przedstawienia w pracy

Na podstawie zapisanych danych można analizować m.in.:

- rozkład score dla próbek owner,
- rozkład score dla próbek impostor,
- porównanie finalScore, statisticalScore i tensorflowScore,
- błąd rekonstrukcji TensorFlow względem progu,
- porównanie TensorFlow score i statisticalScore,
- wpływ liczby próbek enrollment na stabilność profilu,
- najczęstsze digrafy użytkownika,
- zmienność cech takich jak dwell, flight, releasePress i overlapRate,
- FAR, FRR, EER, accuracy, jeśli zebrano próbki owner i impostor.

## 13. Ważne założenia metodologiczne

Zwykły użytkownik nie widzi score podczas pisania. Ma to ograniczyć wpływ informacji zwrotnej na naturalny sposób pisania.

Treść notatek nie jest analizowana przez model. Model wykorzystuje cechy czasowe i behawioralne.

Etap enrollment powinien być oddzielony od etapu verification. Dlatego profil można zamrozić przed rozpoczęciem właściwego testowania.

Dane impostor powinny być zbierane na kontach testowych lub w kontrolowanych warunkach, bez udostępniania prywatnych danych użytkownika.
