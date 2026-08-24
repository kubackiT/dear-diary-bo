# Dear Diary - opis zbierania i przetwarzania danych badawczych

## 1. Cel modułu badawczego

Aplikacja Dear Diary jest aplikacją dziennika/notatnika, która pełni rolę środowiska do naturalnego zbierania danych o dynamice pisania na klawiaturze. Celem badawczym jest sprawdzenie, czy na podstawie sposobu pisania użytkownika można zbudować jego profil behawioralny, a następnie weryfikować, czy kolejne próbki pisania są zgodne z tym profilem.

Badanie nie polega na analizie treści notatek. Istotne są wyłącznie cechy czasowe i behawioralne związane z obsługą klawiatury, np. czas przytrzymania klawiszy, czas przejścia między klawiszami, pauzy, poprawki oraz rytm wpisywania par klawiszy.

## 2. Tryb działania

Moduł badawczy działa wyłącznie w trybie zbierania danych. Trenowanie i ocena modeli odbywają się później, poza aplikacją, na wyeksportowanym zbiorze.

### Enrollment

Tryb `Enrollment` służy do budowania profilu użytkownika. Użytkownik pisze naturalnie w aplikacji, a system zbiera próbki dynamiki pisania. Po osiągnięciu ustawionego progu liczby naciśnięć klawiszy próbka jest zapisywana w bazie jako dane profilujące.

Pojedyncza próbka enrollment jest tworzona po zarejestrowaniu 250 zakończonych naciśnięć klawiszy. Cel motywacyjny wynosi 100 próbek, czyli około 25 000 naciśnięć. Osiągnięcie celu nie blokuje dalszego zbierania. Aplikacja nie trenuje wtedy modelu, nie zamraża profilu i nie przechodzi do fazy verification.

### Verification (funkcjonalność nieaktywna w obecnym badaniu)

Tryb `Verification` służy do testowania gotowego profilu. Nowe próbki nie aktualizują już profilu, tylko są porównywane z wcześniej utworzonym modelem użytkownika. Domyślnie każda próbka obejmuje 250 zakończonych naciśnięć. Po jej wysłaniu bufor pomiarowy jest zerowany, dlatego kolejne wyniki powstają z niezależnych, a nie kumulacyjnych fragmentów pisania. Wynikiem jest score zgodności oraz decyzja, czy próbka pasuje do profilu.

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

Frontend wysyła do backendu wszystkie zarejestrowane digrafy z próbki. Backend dopiero podczas budowy profilu wybiera najczęstsze digrafy ze zbioru treningowego użytkownika. Liczba digrafów użytych jako cechy modelu jest ustawiana w panelu admina:

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

Domyślna liczba próbek wymagana do rozpoczęcia trenowania jest określana przez ustawienie:

```text
Target enrollment samples
```

Domyślna wartość wynosi 100. Backend przyjmuje próbki z aktualnego `profileVersion` również po osiągnięciu celu. Cel służy do prezentacji postępu, a trenowanie nie jest uruchamiane przez aplikację.

Próbki są uporządkowane chronologicznie i dzielone zgodnie z ustawieniem `validationFraction`, którego domyślna wartość wynosi `0.2`:

```text
pierwsze 80 próbek  -> zbiór treningowy
ostatnie 20 próbek  -> zbiór walidacyjny
```

Zbiór walidacyjny służy do wyznaczenia progów obu modeli. Nie jest końcowym zbiorem testowym — tę rolę pełnią późniejsze próbki verification właściciela i impostorów.

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

Na podstawie wektorów ze zbioru treningowego backend wylicza:

```text
meanVector
stdVector
threshold
featureNames
sampleCount
trainingSampleCount
validationSampleCount
```

`meanVector` to średni wektor cech użytkownika.

`stdVector` opisuje typową zmienność każdej cechy. Dla części cech stosowane są minimalne wartości odchylenia, żeby profil nie był zbyt wrażliwy na małe różnice wynikające np. z małej liczby próbek.

`threshold` jest progiem bazowym używanym przez prostszy model statystyczny. Nie jest wyznaczany na próbkach treningowych. Backend oblicza odległości próbek walidacyjnych od profilu, a następnie stosuje:

```text
distance = sqrt(mean(((x - meanVector) / stdVector)²))
threshold = max(1.5, mean(distance) + 2 * stdDev(distance))
```

`distance` oznacza znormalizowane odchylenie próbki od profilu statystycznego. Nie jest wynikiem działania autoenkodera.

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

1. Backend pobiera 100 próbek enrollment użytkownika z aktualnej wersji profilu.
2. Dzieli je chronologicznie na 80 próbek treningowych i 20 walidacyjnych.
3. Zamienia próbki na wektory cech.
4. Normalizuje wektory z użyciem `meanVector` i `stdVector` wyznaczonych na zbiorze treningowym.
5. Trenuje autoenkoder TensorFlow wyłącznie na próbkach treningowych.
6. Oblicza błędy rekonstrukcji dla próbek walidacyjnych.
7. Wyznacza próg rekonstrukcji:

```text
reconstructionThreshold = max(0.05, reconstructionMean + 3 * reconstructionStdDev)
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
profileVersion
trainingSampleCount
validationSampleCount
```

Po poprawnym zapisaniu modelu backend automatycznie zamraża profil i wyłącza jego aktualizowanie. Stan runtime jest wyznaczany osobno dla zalogowanego użytkownika: brak gotowego profilu oznacza `enrollment`, natomiast istnienie zamrożonego profilu i modelu oznacza `verification`. Jeżeli trenowanie zakończy się błędem, profil pozostaje niezamrożony, a administrator może ponowić operację przyciskiem `Retry profile training`.

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

### 10.1. Stan eksperymentu

Panel pokazuje tryb `enrollment` oraz liczbę zebranych próbek. W obecnym badaniu nie następuje automatyczna zmiana fazy.

### 10.2. Target enrollment samples

Motywacyjny cel liczby zebranych próbek. Domyślna wartość wynosi 100; próbki ponad cel również są zapisywane.

### 10.2.1. Registration enabled

Przełącznik dostępny administratorowi, który tymczasowo włącza lub wyłącza możliwość zakładania nowych kont. Wyłączenie jest egzekwowane przez backend; nie wpływa na logowanie ani pracę istniejących użytkowników.

### 10.3. Validation fraction

Część próbek odkładana do wyznaczenia progów. Domyślna wartość `0.2` oznacza podział 80%/20%.

### 10.4. Enrollment key threshold

Liczba zakończonych naciśnięć potrzebna do utworzenia jednej próbki enrollment. Domyślna wartość wynosi 250.

### 10.5. Verification key threshold

Stała długość niezależnej próbki verification. Domyślna wartość wynosi 250. Po wysłaniu próbki pomiary są zerowane.

### 10.6. Long pause threshold ms

Próg rozdzielający zwykłe przejście między klawiszami od długiej pauzy.

### 10.7. Max digraph features

Liczba najczęstszych digrafów używana jako cechy modelu.

### 10.8. Selected user

Pozwala wybrać użytkownika, którego statystyki i wyniki są wyświetlane.

### 10.9. Current verification actor

Pozwala oznaczyć, kto aktualnie pisze próbki verification dla wybranego profilu:

```text
Owner
Impostor
```

To ustawienie jest zapisywane przy nowych próbkach verification jako `actorType`.

### 10.10. Retry profile training

Ponawia trenowanie, jeżeli po osiągnięciu celu wcześniejsza próba zakończyła się błędem. Jeżeli model został zapisany, ale nie udało się zamrozić profilu, ponowienie kończy proces zamrożenia.

### 10.11. Start new enrollment round

Rozpoczyna badanie wybranego użytkownika od początku: zwiększa `profileVersion`, czyści bieżący profil i model oraz przełącza system do enrollment. Historyczne próbki pozostają w bazie, lecz nie są wykorzystywane przez nową wersję. Dla nowego użytkownika przycisk nie jest potrzebny, jeżeli system znajduje się już w fazie enrollment.

## 11. Sugerowany przebieg badania

1. Utworzyć konto użytkownika.
2. Upewnić się, że system znajduje się w fazie `Enrollment`.
3. Użytkownik pisze naturalnie w aplikacji; pasek pokazuje postęp do celu 100 próbek.
4. Jeśli użytkownik nie osiągnie celu, zachować zebrane próbki i uwzględnić je zgodnie z później przyjętym minimum analitycznym.
5. Po osiągnięciu celu pozwolić użytkownikowi nadal zbierać próbki.
6. Wyeksportować dane z MongoDB.
7. Trenować i porównywać modele offline dla różnych liczebności próbek.

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

Aplikacja pozostaje w trybie enrollment przez całe badanie. Zebrane dane nie powodują automatycznego trenowania ani zamrożenia profilu; podział danych i ocena modeli są wykonywane później offline.

Dane impostor powinny być zbierane na kontach testowych lub w kontrolowanych warunkach, bez udostępniania prywatnych danych użytkownika.
