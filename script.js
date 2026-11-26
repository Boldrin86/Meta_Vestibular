(function () {
    var storageKeys = {
        study: "metaVestibularStudy",
        favorites: "metaVestibularFavorites",
        settings: "metaVestibularSettings",
        theme: "metaVestibularTheme"
    };
    var searchInput = document.getElementById("site-search");
    var searchForm = document.querySelector(".search-bar");
    var activeFilter = "todos";

    function showStorageError() {
        var notice = document.getElementById("site-storage-status");
        if (!notice) {
            notice = document.createElement("p");
            notice.id = "site-storage-status";
            notice.className = "storage-error";
            notice.setAttribute("role", "alert");
            document.body.insertBefore(notice, document.body.firstChild);
        }
        notice.hidden = false;
        notice.textContent = "Não foi possível salvar seus dados neste navegador. Verifique as permissões de armazenamento e tente novamente.";
    }

    function readJson(key, fallback) {
        var value;
        try {
            value = window.localStorage.getItem(key);
        } catch (error) {
            console.error("Não foi possível ler os dados locais.", error);
            showStorageError();
            return fallback;
        }
        if (!value) return fallback;

        try {
            return JSON.parse(value);
        } catch (error) {
            console.error("Os dados salvos localmente estão inválidos.", error);
            showStorageError();
            return fallback;
        }
    }

    function writeJson(key, value) {
        try {
            window.localStorage.setItem(key, JSON.stringify(value));
            return true;
        } catch (error) {
            console.error("Não foi possível salvar os dados locais.", error);
            showStorageError();
            return false;
        }
    }

    function isRecord(value) {
        return value !== null && typeof value === "object" && !Array.isArray(value);
    }

    function loadStudy() {
        var value = readJson(storageKeys.study, {});
        if (!isRecord(value)) {
            console.error("O registro local de estudos tem um formato inválido.");
            return { answers: {}, attempts: [] };
        }
        return {
            answers: isRecord(value.answers) ? value.answers : {},
            attempts: Array.isArray(value.attempts) ? value.attempts : []
        };
    }

    function loadSettings() {
        var value = readJson(storageKeys.settings, {});
        if (!isRecord(value)) value = {};
        return {
            name: typeof value.name === "string" ? value.name.slice(0, 40) : "",
            dailyGoal: Number.isInteger(Number(value.dailyGoal))
                ? Math.min(100, Math.max(1, Number(value.dailyGoal)))
                : 10,
            highContrast: value.highContrast === true,
            reduceMotion: value.reduceMotion === true
        };
    }

    function loadFavorites() {
        var value = readJson(storageKeys.favorites, []);
        if (!Array.isArray(value)) {
            console.error("A lista local de destaques tem um formato inválido.");
            return [];
        }
        return value.filter(function (item) {
            return isRecord(item)
                && typeof item.id === "string"
                && typeof item.title === "string"
                && typeof item.href === "string"
                && !/^\s*(?:javascript|data|vbscript):/i.test(item.href)
                && !/^\/\//.test(item.href);
        });
    }

    function applyTheme() {
        var dark = readJson(storageKeys.theme, "light") === "dark";
        if (dark) {
            document.documentElement.setAttribute("data-theme", "dark");
        } else {
            document.documentElement.removeAttribute("data-theme");
        }

        Array.prototype.forEach.call(
            document.querySelectorAll("[data-theme-toggle]"),
            function (button) {
                button.setAttribute("aria-pressed", String(dark));
                button.setAttribute("aria-label", dark ? "Ativar modo claro" : "Ativar modo escuro");
                button.title = dark ? "Ativar modo claro" : "Ativar modo escuro";
                button.querySelector("i").className = dark ? "fa-solid fa-sun" : "fa-solid fa-moon";
            }
        );
    }

    function createQuestionCard(question) {
        var card = document.createElement("article");
        card.className = "question-card";
        card.id = question.id;
        card.dataset.category = question.category;
        card.dataset.questionId = question.id;
        card.dataset.correct = String(question.correct);
        card.dataset.favoriteCard = "";
        card.dataset.favoriteId = "question-" + question.id;
        card.dataset.favoriteHref = "questoes.html#" + question.id;

        var heading = document.createElement("div");
        heading.className = "question-card-heading";
        var subject = document.createElement("span");
        subject.className = "question-subject";
        subject.textContent = question.subject;
        var number = document.createElement("span");
        number.className = "question-number";
        number.textContent = String(question.number).padStart(2, "0");
        heading.appendChild(subject);
        heading.appendChild(number);

        var title = document.createElement("h3");
        title.textContent = question.title;
        var prompt = document.createElement("p");
        prompt.className = "question-prompt";
        prompt.textContent = question.prompt;

        var form = document.createElement("form");
        form.className = "question-form";
        var fieldset = document.createElement("fieldset");
        var legend = document.createElement("legend");
        legend.textContent = "Escolha uma alternativa";
        fieldset.appendChild(legend);
        question.options.forEach(function (option, index) {
            var label = document.createElement("label");
            if (index === question.correct) label.setAttribute("data-correct-option", "");
            var input = document.createElement("input");
            input.type = "radio";
            input.name = question.id;
            input.value = String(index);
            label.appendChild(input);
            label.appendChild(document.createTextNode(" " + option));
            fieldset.appendChild(label);
        });

        var feedback = document.createElement("p");
        feedback.className = "question-feedback";
        feedback.setAttribute("data-question-feedback", "");
        feedback.setAttribute("aria-live", "polite");
        feedback.hidden = true;
        var explanation = document.createElement("p");
        explanation.className = "question-explanation";
        explanation.setAttribute("data-question-explanation", "");
        explanation.textContent = question.explanation;
        explanation.hidden = true;

        var actions = document.createElement("div");
        actions.className = "question-actions";
        var submit = document.createElement("button");
        submit.className = "answer-button";
        submit.type = "submit";
        submit.textContent = "Conferir resposta";
        var retry = document.createElement("button");
        retry.className = "retry-button";
        retry.type = "button";
        retry.setAttribute("data-question-retry", "");
        retry.textContent = "Tentar novamente";
        retry.hidden = true;
        actions.appendChild(submit);
        actions.appendChild(retry);

        form.appendChild(fieldset);
        form.appendChild(feedback);
        form.appendChild(explanation);
        form.appendChild(actions);
        card.appendChild(heading);
        card.appendChild(title);
        card.appendChild(prompt);
        card.appendChild(form);
        return card;
    }

    function initializeQuestionBank() {
        var grid = document.getElementById("questions-grid");
        if (!grid) return;

        if (!Array.isArray(window.metaQuestionBank)) {
            console.error("O banco adicional de questões não foi carregado.");
            var errorMessage = document.getElementById("question-bank-error");
            if (errorMessage) errorMessage.hidden = false;
            return;
        }

        window.metaQuestionBank.forEach(function (question) {
            if (document.getElementById(question.id)) {
                console.error("ID de questão duplicado:", question.id);
                return;
            }
            grid.appendChild(createQuestionCard(question));
        });

        var total = grid.querySelectorAll(".question-card").length;
        var main = findParent(grid, "main");
        if (main) main.setAttribute("data-total-questions", String(total));
        var totalLabel = document.getElementById("questions-total");
        if (totalLabel) totalLabel.textContent = String(total);
    }

    function normalize(value) {
        return value
            .toLocaleLowerCase("pt-BR")
            .normalize("NFD")
            .replace(/[\u0300-\u036f]/g, "");
    }

    function getCards() {
        return Array.prototype.slice.call(document.querySelectorAll(
            ".article-card, .book-card, .material-card, .question-card, .highlight-card"
        ));
    }

    function updateResults() {
        var term = normalize(searchInput ? searchInput.value.trim() : "");
        var cards = getCards();
        var visible = 0;

        cards.forEach(function (card) {
            var matchesCategory = activeFilter === "todos"
                || card.dataset.category === activeFilter;
            var searchableText = normalize(
                (card.innerText || "") + " " + (card.dataset.search || "")
            );
            var show = matchesCategory && (!term || searchableText.indexOf(term) !== -1);
            card.hidden = !show;
            if (show) visible++;
        });

        var emptyMessage = document.querySelector(
            "#books-empty, #materials-empty, #articles-empty, #questions-empty"
        );
        if (emptyMessage) emptyMessage.hidden = visible !== 0;

        var count = document.getElementById("books-count")
            || document.getElementById("materials-count");
        if (count) {
            var noun = count.id === "books-count" ? "material" : "matéria";
            var countValue = count.querySelector("[data-count]");
            if (countValue) {
                countValue.textContent = String(visible);
                countValue.nextSibling.textContent = " " + (visible === 1 ? noun : noun + "s");
            } else {
                count.textContent = visible + " " + (visible === 1 ? noun : noun + "s");
            }
        }

        var highlights = document.getElementById("highlights-list");
        var highlightsEmpty = document.getElementById("highlights-empty");
        var highlightsNoResults = document.getElementById("highlights-no-results");
        if (highlights) {
            var savedCount = highlights.querySelectorAll(".highlight-card").length;
            if (highlightsEmpty) highlightsEmpty.hidden = savedCount !== 0;
            if (highlightsNoResults) {
                highlightsNoResults.hidden = savedCount === 0 || visible !== 0;
            }
        }
    }

    function applySettings(settings) {
        if (settings.highContrast) {
            document.documentElement.setAttribute("data-contrast", "high");
        } else {
            document.documentElement.removeAttribute("data-contrast");
        }
        if (settings.reduceMotion) {
            document.documentElement.setAttribute("data-reduced-motion", "true");
        } else {
            document.documentElement.removeAttribute("data-reduced-motion");
        }

        Array.prototype.forEach.call(
            document.querySelectorAll("[data-student-name]"),
            function (element) {
                element.textContent = settings.name || "estudante";
            }
        );
    }

    function localDateKey(date) {
        var year = date.getFullYear();
        var month = String(date.getMonth() + 1).padStart(2, "0");
        var day = String(date.getDate()).padStart(2, "0");
        return year + "-" + month + "-" + day;
    }

    function updateProgress() {
        var ring = document.getElementById("task-progress");
        if (!ring) return;

        var study = loadStudy();
        var completed = Object.keys(study.answers).length;
        var total = Number(document.querySelector("[data-total-questions]").dataset.totalQuestions) || 0;
        var boundedCompleted = Math.min(completed, total);
        var percentage = total ? Math.round((boundedCompleted / total) * 100) : 0;
        var correct = study.attempts.filter(function (attempt) {
            return attempt && attempt.correct === true;
        }).length;
        var attempts = study.attempts.length;
        var errors = attempts - correct;
        var correctPercentage = attempts ? Math.round((correct / attempts) * 100) : 0;
        var errorPercentage = attempts ? 100 - correctPercentage : 0;
        var settings = loadSettings();
        var today = localDateKey(new Date());
        var todayCount = study.attempts.filter(function (attempt) {
            return attempt && attempt.date === today;
        }).length;
        var goalPercentage = Math.min(100, Math.round((todayCount / settings.dailyGoal) * 100));

        document.getElementById("completed-tasks").textContent = String(boundedCompleted);
        ring.setAttribute("aria-valuemax", String(total));
        ring.setAttribute("aria-valuenow", String(boundedCompleted));
        ring.style.setProperty("--progress", percentage + "%");
        document.getElementById("attempt-count").textContent = String(attempts);
        document.getElementById("correct-count").textContent = String(correct);
        document.getElementById("error-count").textContent = String(errors);
        document.getElementById("correct-percentage").textContent = correctPercentage + "%";
        document.getElementById("error-percentage").textContent = errorPercentage + "%";

        var correctBar = document.getElementById("correct-progress");
        var errorBar = document.getElementById("error-progress");
        correctBar.setAttribute("aria-valuenow", String(correctPercentage));
        errorBar.setAttribute("aria-valuenow", String(errorPercentage));
        correctBar.firstElementChild.style.width = correctPercentage + "%";
        errorBar.firstElementChild.style.width = errorPercentage + "%";

        document.getElementById("today-count").textContent = String(todayCount);
        document.getElementById("daily-goal-count").textContent = String(settings.dailyGoal);
        var dailyBar = document.getElementById("daily-goal-progress");
        dailyBar.setAttribute("aria-valuemax", String(settings.dailyGoal));
        dailyBar.setAttribute("aria-valuenow", String(Math.min(todayCount, settings.dailyGoal)));
        dailyBar.firstElementChild.style.width = goalPercentage + "%";

        var emptyMessage = document.getElementById("progress-empty");
        if (emptyMessage) emptyMessage.hidden = attempts !== 0;
    }

    function findParent(element, selector) {
        while (element && element.nodeType === 1) {
            if (element.matches(selector)) return element;
            element = element.parentElement;
        }
        return null;
    }

    function questionFeedback(card, answer) {
        var form = card.querySelector(".question-form");
        var feedback = form.querySelector("[data-question-feedback]");
        var explanation = form.querySelector("[data-question-explanation]");
        var retry = form.querySelector("[data-question-retry]");
        var submit = form.querySelector('[type="submit"]');
        var correctOption = card.querySelector("[data-correct-option]");
        var radios = form.querySelectorAll('input[type="radio"]');
        var selectedValue = answer && answer.value !== undefined ? String(answer.value) : null;

        Array.prototype.forEach.call(radios, function (radio) {
            radio.disabled = Boolean(answer);
            radio.checked = selectedValue === radio.value;
            var label = findParent(radio, "label");
            if (label) label.classList.toggle("selected", radio.checked);
        });

        if (!answer) {
            feedback.hidden = true;
            explanation.hidden = true;
            retry.hidden = true;
            submit.hidden = false;
            return;
        }

        feedback.hidden = false;
        feedback.dataset.result = answer.correct ? "correct" : "incorrect";
        feedback.textContent = answer.correct
            ? "Resposta correta!"
            : "Resposta incorreta. Gabarito: " + correctOption.textContent.trim();
        explanation.hidden = false;
        retry.hidden = false;
        submit.hidden = true;
    }

    function restoreQuestionAnswers() {
        var cards = document.querySelectorAll(".question-card");
        if (!cards.length) return;

        var answers = loadStudy().answers;
        Array.prototype.forEach.call(cards, function (card) {
            questionFeedback(card, answers[card.dataset.questionId] || null);
        });
    }

    function handleQuestionSubmit(form) {
        var card = findParent(form, ".question-card");
        var selected = form.querySelector('input[type="radio"]:checked');
        var feedback = form.querySelector("[data-question-feedback]");

        if (!selected) {
            feedback.hidden = false;
            feedback.dataset.result = "invalid";
            feedback.textContent = "Selecione uma alternativa antes de conferir.";
            return;
        }

        var correct = Number(selected.value) === Number(card.dataset.correct);
        var answer = {
            value: selected.value,
            correct: correct,
            date: localDateKey(new Date())
        };
        var study = loadStudy();
        study.answers[card.dataset.questionId] = answer;
        study.attempts.push({
            id: card.dataset.questionId,
            correct: correct,
            date: answer.date
        });

        writeJson(storageKeys.study, study);
        questionFeedback(card, answer);
        updateProgress();
    }

    function favoriteDetails(card) {
        var title = card.querySelector("h3");
        var description = card.querySelector(".question-prompt")
            || card.querySelector(".material-card-body p")
            || card.querySelector(".book-card-body p");
        var category = card.querySelector(".question-subject, .material-area, .book-category");
        var link = card.querySelector("a[href]");

        return {
            id: card.dataset.favoriteId,
            title: title ? title.textContent.trim() : "",
            description: description ? description.textContent.trim() : "",
            category: category ? category.textContent.trim() : "Conteúdo",
            href: card.dataset.favoriteHref || (link ? link.getAttribute("href") : ""),
            type: card.classList.contains("question-card")
                ? "Questão"
                : card.classList.contains("book-card") ? "Livro" : "Matéria"
        };
    }

    function isFavorite(favorites, id) {
        return favorites.some(function (item) { return item.id === id; });
    }

    function updateFavoriteToggles() {
        var favorites = loadFavorites();
        Array.prototype.forEach.call(
            document.querySelectorAll("[data-favorite-toggle]"),
            function (button) {
                var card = findParent(button, "[data-favorite-card]");
                var saved = card && isFavorite(favorites, card.dataset.favoriteId);
                button.setAttribute("aria-pressed", String(Boolean(saved)));
                button.querySelector("span").textContent = saved
                    ? "Salvo nos destaques"
                    : "Salvar nos destaques";
                button.querySelector("i").className = saved
                    ? "fa-solid fa-star"
                    : "fa-regular fa-star";
            }
        );
    }

    function addFavoriteButtons() {
        Array.prototype.forEach.call(
            document.querySelectorAll("[data-favorite-card]"),
            function (card) {
                if (card.querySelector("[data-favorite-toggle]")) return;
                var target = card.querySelector(".material-card-body, .book-card-body") || card;
                var button = document.createElement("button");
                button.className = "favorite-toggle";
                button.type = "button";
                button.setAttribute("data-favorite-toggle", "");
                button.setAttribute("aria-pressed", "false");
                button.innerHTML = '<i class="fa-regular fa-star" aria-hidden="true"></i><span>Salvar nos destaques</span>';
                target.appendChild(button);
            }
        );
        updateFavoriteToggles();
    }

    function createHighlightCard(item) {
        var card = document.createElement("article");
        card.className = "highlight-card";
        card.dataset.favoriteId = item.id;
        card.dataset.search = [item.title, item.description, item.category].join(" ");

        var type = document.createElement("span");
        type.className = "highlight-type";
        type.textContent = item.type || "Conteúdo";
        var title = document.createElement("h3");
        title.textContent = item.title;
        var category = document.createElement("span");
        category.className = "highlight-type";
        category.textContent = item.category || "Conteúdo";
        var description = document.createElement("p");
        description.textContent = item.description || "Salvo para revisar mais tarde.";
        var actions = document.createElement("div");
        actions.className = "highlight-actions";
        var open = document.createElement("a");
        open.className = "highlight-open";
        open.href = item.href;
        open.textContent = item.href.indexOf("http") === 0 ? "Abrir conteúdo" : "Abrir página";
        if (item.href.indexOf("http") === 0) {
            open.target = "_blank";
            open.rel = "noopener noreferrer";
        }
        var remove = document.createElement("button");
        remove.className = "highlight-remove";
        remove.type = "button";
        remove.dataset.highlightRemove = item.id;
        remove.innerHTML = '<i class="fa-solid fa-trash-can" aria-hidden="true"></i> Remover';

        actions.appendChild(open);
        actions.appendChild(remove);
        card.appendChild(type);
        card.appendChild(title);
        card.appendChild(category);
        card.appendChild(description);
        card.appendChild(actions);
        return card;
    }

    function renderHighlights() {
        var list = document.getElementById("highlights-list");
        if (!list) return;
        var favorites = loadFavorites();
        list.textContent = "";
        favorites.forEach(function (item) {
            list.appendChild(createHighlightCard(item));
        });
        var count = document.getElementById("highlights-count");
        if (count) {
            count.textContent = favorites.length + " " + (favorites.length === 1 ? "item salvo" : "itens salvos");
        }
        updateResults();
    }

    function handleFavoriteClick(button) {
        var card = findParent(button, "[data-favorite-card]");
        if (!card) return;
        var item = favoriteDetails(card);
        var favorites = loadFavorites();
        var index = favorites.findIndex(function (favorite) { return favorite.id === item.id; });

        if (index >= 0) {
            favorites.splice(index, 1);
        } else {
            favorites.push(item);
        }
        writeJson(storageKeys.favorites, favorites);
        updateFavoriteToggles();
        renderHighlights();
    }

    function initSettings() {
        var form = document.getElementById("settings-form");
        var settings = loadSettings();
        applySettings(settings);
        if (!form) return;

        form.elements.studentName.value = settings.name;
        form.elements.dailyGoal.value = String(settings.dailyGoal);
        form.elements.highContrast.checked = settings.highContrast;
        form.elements.reduceMotion.checked = settings.reduceMotion;

        form.addEventListener("submit", function (event) {
            event.preventDefault();
            var name = form.elements.studentName.value.trim();
            var dailyGoal = Number(form.elements.dailyGoal.value);
            var status = document.getElementById("settings-status");

            if (!Number.isInteger(dailyGoal) || dailyGoal < 1 || dailyGoal > 100) {
                form.elements.dailyGoal.focus();
                status.textContent = "Informe uma meta entre 1 e 100 questões por dia.";
                return;
            }

            settings = {
                name: name,
                dailyGoal: dailyGoal,
                highContrast: form.elements.highContrast.checked,
                reduceMotion: form.elements.reduceMotion.checked
            };
            if (writeJson(storageKeys.settings, settings)) {
                applySettings(settings);
                status.textContent = "Configurações salvas neste dispositivo.";
                updateProgress();
            } else {
                status.textContent = "Não foi possível salvar. Verifique o armazenamento do navegador.";
            }
        });

        var reset = document.querySelector("[data-reset-study]");
        if (reset) {
            reset.addEventListener("click", function () {
                if (!window.confirm("Apagar o histórico de respostas e reiniciar seu progresso? Seus destaques e configurações serão mantidos.")) {
                    return;
                }
                if (writeJson(storageKeys.study, { answers: {}, attempts: [] })) {
                    document.getElementById("settings-status").textContent = "Progresso apagado. Seus destaques e configurações foram mantidos.";
                    updateProgress();
                }
            });
        }
    }

    applySettings(loadSettings());
    applyTheme();
    initializeQuestionBank();
    addFavoriteButtons();
    renderHighlights();
    restoreQuestionAnswers();
    updateProgress();
    initSettings();

    if (searchInput) {
        var initialQuery = new URLSearchParams(window.location.search).get("q") || "";
        searchInput.value = initialQuery;
        searchInput.addEventListener("input", updateResults);
        updateResults();
    }

    if (searchForm) {
        searchForm.addEventListener("submit", function (event) {
            event.preventDefault();
            if (!searchInput) return;

            var query = searchInput.value.trim();
            if (!getCards().length && query) {
                window.location.href = "questoes.html?q=" + encodeURIComponent(query);
                return;
            }

            var url = new URL(window.location.href);
            if (query) {
                url.searchParams.set("q", query);
            } else {
                url.searchParams.delete("q");
            }
            window.history.replaceState(null, "", url);
            updateResults();
        });
    }

    Array.prototype.forEach.call(
        document.querySelectorAll(".book-filter, .subject-filter"),
        function (button) {
            button.addEventListener("click", function () {
                activeFilter = button.dataset.filter || "todos";
                Array.prototype.forEach.call(
                    document.querySelectorAll(".book-filter, .subject-filter"),
                    function (filter) {
                        var active = filter === button;
                        filter.classList.toggle("active", active);
                        filter.setAttribute("aria-pressed", String(active));
                    }
                );
                updateResults();
            });
        }
    );

    document.addEventListener("submit", function (event) {
        var form = event.target;
        if (form.matches(".question-form")) {
            event.preventDefault();
            handleQuestionSubmit(form);
        }
    });

    document.addEventListener("change", function (event) {
        if (event.target.matches('.question-form input[type="radio"]')) {
            Array.prototype.forEach.call(
                event.target.form.querySelectorAll("label"),
                function (label) { label.classList.toggle("selected", label.contains(event.target)); }
            );
        }
    });

    document.addEventListener("click", function (event) {
        var themeButton = findParent(event.target, "[data-theme-toggle]");
        var favoriteButton = findParent(event.target, "[data-favorite-toggle]");
        var removeButton = findParent(event.target, "[data-highlight-remove]");
        var retryButton = findParent(event.target, "[data-question-retry]");

        if (themeButton) {
            var nextTheme = document.documentElement.getAttribute("data-theme") === "dark"
                ? "light"
                : "dark";
            if (writeJson(storageKeys.theme, nextTheme)) applyTheme();
        } else if (favoriteButton) {
            handleFavoriteClick(favoriteButton);
        } else if (removeButton) {
            var id = removeButton.dataset.highlightRemove;
            var favorites = loadFavorites().filter(function (item) { return item.id !== id; });
            writeJson(storageKeys.favorites, favorites);
            updateFavoriteToggles();
            renderHighlights();
        } else if (retryButton) {
            var form = findParent(retryButton, ".question-form");
            var card = findParent(retryButton, ".question-card");
            Array.prototype.forEach.call(
                form.querySelectorAll('input[type="radio"]'),
                function (radio) {
                    radio.disabled = false;
                    radio.checked = false;
                }
            );
            card.querySelector("[data-question-feedback]").hidden = true;
            card.querySelector("[data-question-explanation]").hidden = true;
            retryButton.hidden = true;
            form.querySelector('[type="submit"]').hidden = false;
            Array.prototype.forEach.call(form.querySelectorAll("label"), function (label) {
                label.classList.remove("selected");
            });
        }
    });
})();
