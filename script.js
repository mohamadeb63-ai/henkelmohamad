// --- سیستم لاگین ---
        window.onload = function() {
            if(sessionStorage.getItem('henkel-auth') === 'true') {
                document.getElementById('loginOverlay').style.display = 'none';
            }
        };

        document.getElementById('passwordInput').addEventListener('keypress', function (e) {
            if (e.key === 'Enter') checkPassword();
        });

        function checkPassword() {
            const pass = document.getElementById('passwordInput').value;
            if (pass === "1912") {
                sessionStorage.setItem('henkel-auth', 'true');
                document.getElementById('loginOverlay').style.display = 'none';
                setTimeout(() => map.invalidateSize(), 300);
            } else {
                document.getElementById('loginError').style.display = 'block';
            }
        }

        // ---------- اتصال به سرور Supabase ----------
        const SUPABASE_URL = 'https://fpzsqmiztaoxmzzghwcj.supabase.co';
        const SUPABASE_KEY = 'sb_publishable_4tOSUAeWV1tN8QvOVA9LGA_DYZPJDo8';
        let supabaseClient = null;
        try {
            supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
        } catch (e) {
            console.error('کتابخانه Supabase بارگذاری نشد:', e);
        }

        function setSyncStatus(state) {
            const el = document.getElementById('syncStatus');
            if (!el) return;
            if (state === 'loading') { el.innerText = '🔄 در حال اتصال به سرور...'; el.style.color = '#666'; }
            else if (state === 'online') { el.innerText = '✅ متصل به سرور (اطلاعات همگام)'; el.style.color = 'var(--success)'; }
            else if (state === 'saving') { el.innerText = '💾 در حال ذخیره در سرور...'; el.style.color = '#666'; }
            else if (state === 'offline') { el.innerText = '⚠️ عدم اتصال به سرور - نسخه محلی نمایش داده می‌شود'; el.style.color = 'var(--primary)'; }
        }

        // ---------- داده‌های اصلی ----------
        let data = { visitors: [], stores: [], routes: [], visits: [], tasks: [], taskCompletions: [], workHours: [] };

        const dayNames = ['شنبه', 'یکشنبه', 'دوشنبه', 'سه‌شنبه', 'چهارشنبه', 'پنجشنبه', 'جمعه'];
        const routeColors = ['#e20015', '#0056b3', '#28a745', '#e2a700', '#8a2be2', '#00838f', '#c2185b'];

        function getIranianDay(d = new Date()) {
            return (d.getDay() + 1) % 7;
        }

        function applyLoadedContent(parsed) {
            data.visitors = parsed.visitors || [];
            data.stores = parsed.stores || [];
            data.routes = parsed.routes || [];
            data.visits = parsed.visits || [];
            data.tasks = parsed.tasks || [];
            data.taskCompletions = parsed.taskCompletions || [];
            data.workHours = parsed.workHours || [];
        }

        function withTimeout(promise, ms = 8000) {
            return Promise.race([
                promise,
                new Promise((_, reject) => setTimeout(() => reject(new Error('timeout: پاسخی از سرور دریافت نشد')), ms))
            ]);
        }

        async function loadAllData() {
            setSyncStatus('loading');
            if (!supabaseClient) {
                console.log('کتابخانه Supabase در دسترس نیست، استفاده از نسخه محلی.');
                try {
                    const result = localStorage.getItem('henkel-data');
                    if (result) applyLoadedContent(JSON.parse(result));
                } catch (e2) {}
                setSyncStatus('offline');
                updateVisitorUI();
                renderMap();
                return;
            }
            try {
                const { data: row, error } = await withTimeout(
                    supabaseClient.from('henkel_data').select('content').eq('id', 1).single()
                );
                if (error) throw error;
                if (row && row.content) {
                    applyLoadedContent(row.content);
                    // نسخه محلی به‌عنوان کش/پشتیبان به‌روزرسانی می‌شود
                    try { localStorage.setItem('henkel-data', JSON.stringify(data)); } catch (e) {}
                }
                setSyncStatus('online');
            } catch (e) {
                console.log('عدم اتصال به سرور، استفاده از نسخه محلی:', e);
                try {
                    const result = localStorage.getItem('henkel-data');
                    if (result) applyLoadedContent(JSON.parse(result));
                } catch (e2) {}
                setSyncStatus('offline');
            }
            updateVisitorUI();
            renderMap();
        }

        async function refreshFromServer() {
            await loadAllData();
        }

        // --- پشتیبان‌گیری (Backup / Restore) ---
        function exportBackup() {
            const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            const now = new Date();
            const dateStr = now.toISOString().slice(0, 10);
            a.href = url;
            a.download = `henkel-backup-${dateStr}.json`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        }

        function importBackupFile(event) {
            const file = event.target.files[0];
            if (!file) return;
            const reader = new FileReader();
            reader.onload = async function (e) {
                try {
                    const parsed = JSON.parse(e.target.result);
                    if (!confirm('با بارگذاری این فایل، تمام اطلاعات فعلی (روی سرور) جایگزین می‌شود. آیا ادامه می‌دهید؟')) {
                        event.target.value = '';
                        return;
                    }
                    applyLoadedContent(parsed);
                    await saveAllData();
                    alert('بک‌آپ با موفقیت بارگذاری و با سرور همگام شد.');
                    location.reload();
                } catch (err) {
                    alert('فایل بک‌آپ معتبر نیست.');
                } finally {
                    event.target.value = '';
                }
            };
            reader.readAsText(file);
        }

        async function saveAllData() {
            // ذخیره فوری در نسخه محلی (کش/پشتیبان آفلاین)
            try {
                localStorage.setItem('henkel-data', JSON.stringify(data));
            } catch (e) {
                alert('خطا در ذخیره اطلاعات در مرورگر.');
            }

            // ارسال به سرور Supabase
            if (!supabaseClient) { setSyncStatus('offline'); return; }
            setSyncStatus('saving');
            try {
                const { error } = await withTimeout(
                    supabaseClient.from('henkel_data').update({ content: data, updated_at: new Date().toISOString() }).eq('id', 1)
                );
                if (error) throw error;
                setSyncStatus('online');
            } catch (e) {
                console.error('خطا در ذخیره در سرور:', e);
                setSyncStatus('offline');
            }
        }

        // حالت‌های کاری
        let isStoreMode = false;
        let isRouteMode = false;
        let isEditRouteMode = false;
        
        let currentRoutePoints = [];
        let tempPolyline = null;
        
        let editMarkers = [];
        let editPolyline = null;

        // نقشه و لایه‌ها
        const map = L.map('map').setView([36.2447, 46.2736], 14);
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: 'Henkel Sales Management'
        }).addTo(map);

        const storesLayer = L.layerGroup().addTo(map);
        const routesLayer = L.layerGroup().addTo(map);
        const todayRouteLayer = L.layerGroup().addTo(map);
        const mapContainer = document.getElementById('map');

        function fillDaySelect() {
            const sel = document.getElementById('routeDaySelect');
            sel.innerHTML = '';
            dayNames.forEach((name, idx) => {
                const opt = document.createElement('option');
                opt.value = idx;
                opt.innerText = name;
                sel.appendChild(opt);
            });
            sel.value = getIranianDay();
        }

        // --- ویزیتورها ---
        function addVisitor() {
            let name = document.getElementById('visitorName').value.trim();
            if (name === "") return alert("لطفا نام ویزیتور را وارد کنید.");
            if (data.visitors.includes(name)) return alert("این ویزیتور قبلا ثبت شده است.");

            data.visitors.push(name);
            saveAllData();
            updateVisitorUI();
            document.getElementById('visitorName').value = "";
        }

        function updateVisitorUI() {
            let list = document.getElementById('visitorList');
            list.innerHTML = "";
            data.visitors.forEach(v => {
                let li = document.createElement('li');
                li.style.cssText = 'display:flex; justify-content:space-between; align-items:center; gap:8px; list-style:none;';

                let nameSpan = document.createElement('span');
                nameSpan.innerText = v;

                let editBtn = document.createElement('button');
                editBtn.innerText = '✏️ ویرایش';
                editBtn.style.cssText = 'width:auto; padding:3px 8px; margin:0; background:var(--warning); font-size:11px;';
                editBtn.onclick = function () { editVisitorName(v); };

                li.appendChild(nameSpan);
                li.appendChild(editBtn);
                list.appendChild(li);
            });

            fillSelectWithVisitors('routeVisitorSelect', 'انتخاب ویزیتور...');
            fillSelectWithVisitors('todayVisitorSelect', 'انتخاب ویزیتور...');
            fillSelectWithVisitors('reportVisitorSelect', 'همه ویزیتورها', true);
            fillSelectWithVisitors('weeklyVisitorSelect', 'انتخاب ویزیتور...');
            fillSelectWithVisitors('workHoursVisitorSelect', 'انتخاب ویزیتور...');
        }

        function editVisitorName(oldName) {
            const newName = prompt("نام جدید ویزیتور:", oldName);
            if (newName === null) return;
            const trimmed = newName.trim();
            if (trimmed === '') return alert('نام نمی‌تواند خالی باشد.');
            if (trimmed === oldName) return;
            if (data.visitors.includes(trimmed)) return alert('این نام قبلاً برای ویزیتور دیگری ثبت شده است.');

            // به‌روزرسانی نام در همه بخش‌های سیستم
            const idx = data.visitors.indexOf(oldName);
            if (idx !== -1) data.visitors[idx] = trimmed;
            data.stores.forEach(s => { if (s.visitor === oldName) s.visitor = trimmed; });
            data.routes.forEach(r => { if (r.visitor === oldName) r.visitor = trimmed; });
            data.tasks.forEach(t => { if (t.visitor === oldName) t.visitor = trimmed; });
            data.workHours.forEach(w => { if (w.visitor === oldName) w.visitor = trimmed; });
            data.visits.forEach(vv => { if (vv.visitor === oldName) vv.visitor = trimmed; });

            saveAllData();
            updateVisitorUI();
            renderMap();
            alert('نام ویزیتور با موفقیت به‌روزرسانی شد.');
        }

        function fillTaskDaySelect() {
            const sel = document.getElementById('taskDaySelect');
            sel.innerHTML = '<option value="any">هر روز</option>';
            dayNames.forEach((name, idx) => {
                const opt = document.createElement('option');
                opt.value = idx;
                opt.innerText = name;
                sel.appendChild(opt);
            });
        }

        // --- تسک‌ها ---
        function getWeekKey(date = new Date()) {
            const d = new Date(date);
            const dayIdx = getIranianDay(d);
            d.setDate(d.getDate() - dayIdx);
            d.setHours(0, 0, 0, 0);
            return d.toISOString().slice(0, 10);
        }

        function isTaskDone(taskId) {
            const weekKey = getWeekKey();
            return data.taskCompletions.some(tc => tc.taskId === taskId && tc.weekKey === weekKey && tc.done);
        }

        function toggleTaskDone(taskId) {
            const weekKey = getWeekKey();
            const idx = data.taskCompletions.findIndex(tc => tc.taskId === taskId && tc.weekKey === weekKey);
            if (idx >= 0) data.taskCompletions.splice(idx, 1);
            else data.taskCompletions.push({ taskId, weekKey, done: true });
            saveAllData();
            renderWeeklyPlan(document.getElementById('weeklyVisitorSelect').value);
        }

        function addTask() {
            const visitor = document.getElementById('weeklyVisitorSelect').value;
            if (!visitor) return alert('ابتدا ویزیتور را از بالای همین بخش انتخاب کنید.');
            const dayVal = document.getElementById('taskDaySelect').value;
            const text = document.getElementById('taskText').value.trim();
            if (!text) return alert('متن تسک را وارد کنید.');

            data.tasks.push({
                id: Date.now(), visitor, day: dayVal === 'any' ? 'any' : parseInt(dayVal, 10), text
            });
            saveAllData();
            document.getElementById('taskText').value = '';
            renderWeeklyPlan(visitor);
        }

        function deleteTask(taskId) {
            data.tasks = data.tasks.filter(t => t.id !== taskId);
            data.taskCompletions = data.taskCompletions.filter(tc => tc.taskId !== taskId);
            saveAllData();
            renderWeeklyPlan(document.getElementById('weeklyVisitorSelect').value);
        }

        function renderWeeklyPlan(visitor) {
            const container = document.getElementById('weeklyPlanResult');
            container.style.display = 'block';
            if (!visitor) {
                container.innerHTML = '<span class="muted">ابتدا یک ویزیتور انتخاب کنید.</span>';
                return;
            }
            let html = '';
            dayNames.forEach((name, d) => {
                const route = data.routes.find(r => r.visitor === visitor && r.day === d);
                let routeInfo = '<span class="muted">بدون منطقه</span>';
                if (route) routeInfo = `<span class="badge">${storesInRoute(route).length} فروشگاه</span>`;

                const dayTasks = data.tasks.filter(t => t.visitor === visitor && (t.day === d || t.day === 'any'));
                html += `<div style="border-bottom:1px solid #eee; padding:6px 0;"><b>${name}</b> - ${routeInfo}`;
                if (dayTasks.length > 0) {
                    html += '<ul style="list-style:none; padding-right:0; margin:4px 0;">';
                    dayTasks.forEach(t => {
                        const done = isTaskDone(t.id);
                        html += `<li style="display:flex; align-items:center; gap:8px; margin:5px 0;">
                            <input type="checkbox" ${done ? 'checked' : ''} onchange="toggleTaskDone(${t.id})">
                            <span style="flex:1; ${done ? 'text-decoration:line-through;color:#999;' : ''}">${t.text}</span>
                            <button onclick="deleteTask(${t.id})" style="width:auto; padding:4px 8px; margin:0; background:#6c757d; font-size:11px;">حذف</button>
                        </li>`;
                    });
                    html += '</ul>';
                }
                html += '</div>';
            });
            container.innerHTML = html;
        }

        function fillSelectWithVisitors(selectId, placeholder, isReportAll) {
            let select = document.getElementById(selectId);
            const currentValue = select.value;
            select.innerHTML = `<option value="${isReportAll ? 'all' : ''}">${placeholder}</option>`;
            data.visitors.forEach(v => {
                let opt = document.createElement('option'); opt.value = v; opt.innerText = v; select.appendChild(opt);
            });
            if ([...select.options].some(o => o.value === currentValue)) select.value = currentValue;
        }

        // --- فروشگاه‌ها ---
        function toggleStoreMode() {
            if (isEditRouteMode) return alert("ابتدا ویرایش منطقه فعلی را ذخیره کنید.");
            
            isStoreMode = !isStoreMode;
            isRouteMode = false;
            
            document.getElementById('addStoreBtn').style.background = isStoreMode ? "var(--success)" : "var(--secondary)";
            document.getElementById('addStoreBtn').innerText = isStoreMode ? "🟢 آماده ثبت فروشگاه (کلیک کنید)" : "📍 فعال‌سازی کلیک برای ثبت فروشگاه";
            document.getElementById('addRouteBtn').style.background = "var(--secondary)";
            document.getElementById('addRouteBtn').innerText = "✏️ رسم منطقه جدید";

            if(isStoreMode) mapContainer.classList.add('map-crosshair');
            else mapContainer.classList.remove('map-crosshair');
        }

        map.on('click', function (e) {
            if (isStoreMode) {
                if (data.visitors.length === 0) return alert("ابتدا ویزیتور ثبت کنید.");
                
                let storeName = prompt("نام فروشگاه:");
                if (!storeName) return;
                let storeType = prompt("نوع فروشگاه (سوپرمارکت، عمده و...):");
                let ownerName = prompt("نام صاحب فروشگاه:");
                let phoneNumber = prompt("شماره تماس:");

                let visitorText = "کد ویزیتور:\n";
                data.visitors.forEach((v, index) => visitorText += (index + 1) + ". " + v + "\n");
                let vIndex = prompt(visitorText);
                let selectedVisitor = data.visitors[vIndex - 1] || "نامشخص";

                let newStore = {
                    id: Date.now(), name: storeName, type: storeType || "نامشخص",
                    owner: ownerName || "", phone: phoneNumber || "",
                    visitor: selectedVisitor, lat: e.latlng.lat, lng: e.latlng.lng
                };

                data.stores.push(newStore); saveAllData(); drawStore(newStore); toggleStoreMode();
            }
            else if (isRouteMode) {
                currentRoutePoints.push([e.latlng.lat, e.latlng.lng]);
                if (tempPolyline) map.removeLayer(tempPolyline);
                const dayForColor = parseInt(document.getElementById('routeDaySelect').value, 10) || 0;
                const previewColor = routeColors[dayForColor % routeColors.length];
                tempPolyline = L.polygon(currentRoutePoints, { color: previewColor, weight: 3, fillOpacity: 0.25 }).addTo(map);
            }
        });

        // پایان دادن به رسم منطقه با دکمه Ctrl کیبورد
        document.addEventListener('keydown', function(e) {
            if ((e.key === 'Control' || e.ctrlKey || e.metaKey) && isRouteMode && currentRoutePoints.length > 2) {
                e.preventDefault(); // جلوگیری از رفتار پیش‌فرض
                
                let visitor = document.getElementById('routeVisitorSelect').value;
                let day = parseInt(document.getElementById('routeDaySelect').value, 10);
                
                // جایگزین منطقه قبلی
                data.routes = data.routes.filter(r => !(r.visitor === visitor && r.day === day));
                data.routes.push({ id: Date.now(), visitor: visitor, day: day, points: currentRoutePoints });
                saveAllData();

                currentRoutePoints = [];
                if (tempPolyline) { map.removeLayer(tempPolyline); tempPolyline = null; }
                toggleRouteMode(); // خروج از حالت رسم
                renderMap();
                
                alert('منطقه با موفقیت ذخیره شد.');
            }
        });

        function drawStore(store) {
            let marker = L.marker([store.lat, store.lng]);
            let popupContent = `
                <div class="store-popup">
                    <h4>🏪 ${store.name}</h4>
                    <b>نوع:</b> ${store.type}<br>
                    <b>صاحب فروشگاه:</b> ${store.owner || '-'}<br>
                    <b>شماره تماس:</b> ${store.phone || '-'}<br>
                    <b>ویزیتور:</b> ${store.visitor}<br>
                    <button class="info-btn" onclick="logVisit(${store.id})">✅ ثبت ویزیت امروز</button>
                    <button class="warning-btn" onclick="editStore(${store.id})">✏️ ویرایش فروشگاه</button>
                </div>`;
            marker.bindPopup(popupContent).addTo(storesLayer);
        }

        function editStore(id) {
            const store = data.stores.find(s => s.id === id);
            if (!store) return;

            let newName = prompt("نام فروشگاه:", store.name);
            if (newName === null) return;
            let newType = prompt("نوع فروشگاه:", store.type || "");
            let newOwner = prompt("نام صاحب فروشگاه:", store.owner || "");
            let newPhone = prompt("شماره تماس:", store.phone || "");

            let visitorText = "کد ویزیتور جدید (ویزیتور فعلی: " + store.visitor + "):\n";
            data.visitors.forEach((v, index) => visitorText += (index + 1) + ". " + v + "\n");
            let vIndex = prompt(visitorText + "\n(برای عدم تغییر، خالی بگذارید)");
            let newVisitor = data.visitors[vIndex - 1] || store.visitor;

            store.name = newName || store.name;
            store.type = newType || store.type;
            store.owner = newOwner || "";
            store.phone = newPhone || "";
            store.visitor = newVisitor;

            saveAllData();
            renderMap();
            alert("اطلاعات فروشگاه به‌روزرسانی شد.");
        }

        // --- مناطق (جدید و ویرایش) ---
        function toggleRouteMode() {
            if (isEditRouteMode) return alert("ابتدا ویرایش منطقه فعلی را ذخیره کنید.");
            
            let visitor = document.getElementById('routeVisitorSelect').value;
            if (!isRouteMode && !visitor) return alert("ابتدا ویزیتور را از لیست انتخاب کنید.");

            isRouteMode = !isRouteMode;
            isStoreMode = false;
            currentRoutePoints = [];

            let btn = document.getElementById('addRouteBtn');
            btn.style.background = isRouteMode ? "var(--success)" : "var(--secondary)";
            btn.innerText = isRouteMode ? "🟢 در حال رسم (کلید Ctrl=پایان)" : "✏️ رسم منطقه جدید";
            
            document.getElementById('addStoreBtn').style.background = "var(--secondary)";
            document.getElementById('addStoreBtn').innerText = "📍 فعال‌سازی کلیک برای ثبت فروشگاه";
            
            document.getElementById('editRouteBtn').disabled = isRouteMode;
            
            const helper = document.getElementById('routeHelperText');
            if (isRouteMode) {
                map.doubleClickZoom.disable(); // جلوگیری از زوم با دبل کلیک اشتباه حین رسم
                mapContainer.classList.add('map-crosshair');
                helper.style.display = 'block';
                helper.innerText = "برای رسم منطقه، حداقل ۳ نقطه دور منطقه فعالیت کلیک کنید و در انتها کلید Ctrl کیبورد را فشار دهید.";
            } else {
                map.doubleClickZoom.enable();
                mapContainer.classList.remove('map-crosshair');
                helper.style.display = 'none';
                if (tempPolyline) { map.removeLayer(tempPolyline); tempPolyline = null; }
            }
        }

        function toggleEditRouteMode() {
            let visitor = document.getElementById('routeVisitorSelect').value;
            let day = parseInt(document.getElementById('routeDaySelect').value, 10);
            const helper = document.getElementById('routeHelperText');

            if (!isEditRouteMode) {
                if (!visitor) return alert("ابتدا ویزیتور را انتخاب کنید.");
                
                let routeIndex = data.routes.findIndex(r => r.visitor === visitor && r.day === day);
                if (routeIndex === -1) return alert("منطقه‌ای برای این ویزیتور در این روز وجود ندارد تا ویرایش شود.");
                
                // شروع ویرایش
                isEditRouteMode = true;
                document.getElementById('editRouteBtn').innerText = "💾 ذخیره ویرایش";
                document.getElementById('editRouteBtn').style.background = "var(--success)";
                document.getElementById('addRouteBtn').disabled = true;
                
                helper.style.display = 'block';
                helper.innerText = "نقاط (دایره‌های روی منطقه) را با موس گرفته و جابجا کنید. سپس دکمه ذخیره ویرایش را بزنید.";
                
                // مخفی کردن مناطق اصلی
                routesLayer.clearLayers();
                
                let route = data.routes[routeIndex];
                editMarkers = [];
                let points = route.points.map(p => [p[0], p[1]]);
                
                editPolyline = L.polygon(points, { color: 'orange', weight: 4, dashArray: '8, 8', fillOpacity: 0.2 }).addTo(map);
                
                // ایجاد مارکرهای قابل درگ
                points.forEach((pt, idx) => {
                    let marker = L.marker(pt, { draggable: true }).addTo(map);
                    marker.on('drag', function(e) {
                        let newPos = marker.getLatLng();
                        points[idx] = [newPos.lat, newPos.lng];
                        editPolyline.setLatLngs(points); // آپدیت خط حین کشیدن
                    });
                    editMarkers.push(marker);
                });
                
                map.fitBounds(editPolyline.getBounds(), { padding: [30, 30] });

            } else {
                // پایان و ذخیره ویرایش
                let newPoints = editMarkers.map(m => {
                    let pos = m.getLatLng();
                    return [pos.lat, pos.lng];
                });
                
                let routeIndex = data.routes.findIndex(r => r.visitor === visitor && r.day === day);
                if (routeIndex !== -1) {
                    data.routes[routeIndex].points = newPoints;
                    saveAllData();
                }
                
                // خروج از حالت ویرایش
                isEditRouteMode = false;
                document.getElementById('editRouteBtn').innerText = "⚙️ ویرایش منطقه";
                document.getElementById('editRouteBtn').style.background = "var(--warning)";
                document.getElementById('addRouteBtn').disabled = false;
                helper.style.display = 'none';
                
                // پاکسازی مارکرهای ویرایش
                editMarkers.forEach(m => map.removeLayer(m));
                editMarkers = [];
                if (editPolyline) map.removeLayer(editPolyline);
                
                renderMap();
                alert("منطقه با موفقیت به‌روزرسانی شد.");
            }
        }

        function drawRoutes() {
            data.routes.forEach(route => {
                const color = routeColors[route.day % routeColors.length];
                const insideCount = storesInRoute(route).length;
                L.polygon(route.points, { color: color, weight: 3, fillColor: color, fillOpacity: 0.15 })
                  .bindPopup(`ویزیتور: ${route.visitor} | روز: ${dayNames[route.day]} | فروشگاه داخل منطقه: ${insideCount}`)
                  .addTo(routesLayer);
            });
        }
        
        function renderMap() {
            if (isEditRouteMode) return; // اگر در حال ویرایش هستیم نقشه را رندر اصلی نکن
            storesLayer.clearLayers();
            routesLayer.clearLayers();
            data.stores.forEach(drawStore);
            drawRoutes();
        }

        // --- توابع کمکی ---
        // تشخیص اینکه یک نقطه (فروشگاه) داخل منطقه (Polygon) قرار دارد یا نه
        function isPointInPolygon(lat, lng, points) {
            let inside = false;
            for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
                const yi = points[i][0], xi = points[i][1];
                const yj = points[j][0], xj = points[j][1];
                const intersect = ((yi > lat) !== (yj > lat)) &&
                    (lng < (xj - xi) * (lat - yi) / (yj - yi) + xi);
                if (intersect) inside = !inside;
            }
            return inside;
        }

        function storesInRoute(route) {
            if (!route.points || route.points.length < 3) return [];
            return data.stores.filter(s => s.visitor === route.visitor && isPointInPolygon(s.lat, s.lng, route.points));
        }

        function showTodayRoute() {
            const visitor = document.getElementById('todayVisitorSelect').value;
            const resultDiv = document.getElementById('todayResult');
            resultDiv.style.display = 'block';
            todayRouteLayer.clearLayers();

            if (!visitor) {
                resultDiv.innerHTML = '<span class="muted">ابتدا یک ویزیتور انتخاب کنید.</span>';
                return;
            }

            const todayIdx = getIranianDay();
            const route = data.routes.find(r => r.visitor === visitor && r.day === todayIdx);

            if (!route) {
                resultDiv.innerHTML = `<span class="muted">برای <b>${visitor}</b> در روز <b>${dayNames[todayIdx]}</b> هنوز منطقه‌ای ثبت نشده است.</span>`;
                return;
            }

            const polygonLayer = L.polygon(route.points, { color: '#28a745', weight: 4, fillOpacity: 0.25, opacity: 0.9 }).addTo(todayRouteLayer);
            map.fitBounds(polygonLayer.getBounds(), { padding: [30, 30] });

            const inside = storesInRoute(route);
            let html = `روز <b>${dayNames[todayIdx]}</b> - ویزیتور <b>${visitor}</b><br>`;
            html += `<span class="badge">${inside.length} فروشگاه</span> داخل منطقه امروز<br>`;
            if (inside.length > 0) {
                html += '<ul>' + inside.map(s => `<li>${s.name} (${s.type})</li>`).join('') + '</ul>';
            }
            resultDiv.innerHTML = html;
        }

        function logVisit(storeId) {
            const store = data.stores.find(s => s.id === storeId);
            if (!store) return;
            data.visits.push({
                id: Date.now(), storeId: store.id, storeName: store.name,
                visitor: store.visitor, timestamp: Date.now()
            });
            saveAllData();
            alert(`ویزیت از "${store.name}" برای ${store.visitor} ثبت شد.`);
        }

        const periodMs = { week: 7 * 24 * 60 * 60 * 1000, month: 30 * 24 * 60 * 60 * 1000, sixmonth: 182 * 24 * 60 * 60 * 1000, year: 365 * 24 * 60 * 60 * 1000 };
        const periodLabels = { week: 'یک هفته اخیر', month: 'یک ماه اخیر', sixmonth: 'شش ماه اخیر', year: 'یک سال اخیر' };

        function showReport() {
            const visitor = document.getElementById('reportVisitorSelect').value;
            const period = document.getElementById('reportPeriodSelect').value;
            const resultDiv = document.getElementById('reportResult');
            resultDiv.style.display = 'block';

            const cutoff = Date.now() - periodMs[period];
            let filtered = data.visits.filter(v => v.timestamp >= cutoff);
            if (visitor !== 'all') filtered = filtered.filter(v => v.visitor === visitor);

            if (filtered.length === 0) {
                resultDiv.innerHTML = `<span class="muted">در بازه «${periodLabels[period]}» هیچ ویزیتی ثبت نشده است.</span>`;
                return;
            }

            let html = `<b>بازه: ${periodLabels[period]}</b> - مجموع ویزیت‌ها: <span class="badge">${filtered.length}</span><br><br>`;
            if (visitor === 'all') {
                const counts = {};
                filtered.forEach(v => { counts[v.visitor] = (counts[v.visitor] || 0) + 1; });
                html += '<table><tr><th>ویزیتور</th><th>تعداد ویزیت</th></tr>';
                Object.keys(counts).sort((a, b) => counts[b] - counts[a]).forEach(name => {
                    html += `<tr><td>${name}</td><td>${counts[name]}</td></tr>`;
                });
                html += '</table>';
            } else {
                const sorted = filtered.sort((a, b) => b.timestamp - a.timestamp).slice(0, 30);
                html += '<table><tr><th>فروشگاه</th><th>تاریخ و ساعت</th></tr>';
                sorted.forEach(v => {
                    const d = new Date(v.timestamp);
                    const dateStr = d.toLocaleDateString('fa-IR') + ' - ' + d.toLocaleTimeString('fa-IR', { hour: '2-digit', minute: '2-digit' });
                    html += `<tr><td>${v.storeName}</td><td>${dateStr}</td></tr>`;
                });
                html += '</table>';
                if (filtered.length > 30) html += `<div class="muted">فقط ۳۰ مورد آخر نمایش داده شده است.</div>`;
            }
            resultDiv.innerHTML = html;
        }

        async function clearData() {
            if (confirm("آیا مطمئن هستید؟ تمام ویزیتورها، فروشگاه‌ها، مناطق، تسک‌ها، ویزیت‌ها و ساعت‌های کاری روی سرور نیز پاک خواهند شد!")) {
                data = { visitors: [], stores: [], routes: [], visits: [], tasks: [], taskCompletions: [], workHours: [] };
                await saveAllData();
                location.reload();
            }
        }

        // ---------- ساعت کاری پرسنل ----------
        const jalaliMonthNames = ['فروردین', 'اردیبهشت', 'خرداد', 'تیر', 'مرداد', 'شهریور', 'مهر', 'آبان', 'آذر', 'دی', 'بهمن', 'اسفند'];

        // تبدیل تاریخ میلادی به شمسی (الگوریتم استاندارد)
        function gregorianToJalali(gy, gm, gd) {
            const g_d_m = [0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334];
            let jy;
            if (gy <= 1600) { jy = 0; gy -= 621; }
            else { jy = 979; gy -= 1600; }
            const gy2 = (gm > 2) ? (gy + 1) : gy;
            let days = (365 * gy) + parseInt((gy2 + 3) / 4) - parseInt((gy2 + 99) / 100) + parseInt((gy2 + 399) / 400) - 80 + gd + g_d_m[gm - 1];
            jy += 33 * parseInt(days / 12053);
            days %= 12053;
            jy += 4 * parseInt(days / 1461);
            days %= 1461;
            if (days > 365) { jy += parseInt((days - 1) / 365); days = (days - 1) % 365; }
            let jm, jd;
            if (days < 186) { jm = 1 + parseInt(days / 31); jd = 1 + (days % 31); }
            else { jm = 7 + parseInt((days - 186) / 30); jd = 1 + ((days - 186) % 30); }
            return { jy, jm, jd };
        }

        function computeWorkedHours(checkIn, checkOut) {
            const [h1, m1] = checkIn.split(':').map(Number);
            const [h2, m2] = checkOut.split(':').map(Number);
            let minutes = (h2 * 60 + m2) - (h1 * 60 + m1);
            if (minutes < 0) minutes += 24 * 60; // شیفت شبانه/عبور از نیمه‌شب
            return minutes / 60;
        }

        function addWorkHour() {
            const visitor = document.getElementById('workHoursVisitorSelect').value;
            if (!visitor) return alert('ابتدا ویزیتور را انتخاب کنید.');
            const dateVal = document.getElementById('workHoursDate').value;
            const checkIn = document.getElementById('workHoursCheckIn').value;
            const checkOut = document.getElementById('workHoursCheckOut').value;
            const visits = parseInt(document.getElementById('workHoursVisits').value, 10) || 0;

            if (!dateVal || !checkIn || !checkOut) return alert('تاریخ، ساعت ورود و ساعت خروج را وارد کنید.');

            // جایگزینی رکورد قبلی همان تاریخ برای همان ویزیتور
            data.workHours = data.workHours.filter(w => !(w.visitor === visitor && w.date === dateVal));
            data.workHours.push({ id: Date.now(), visitor, date: dateVal, checkIn, checkOut, visits });
            saveAllData();

            document.getElementById('workHoursCheckIn').value = '';
            document.getElementById('workHoursCheckOut').value = '';
            document.getElementById('workHoursVisits').value = '';

            renderWorkHours(visitor);
        }

        function deleteWorkHour(id) {
            data.workHours = data.workHours.filter(w => w.id !== id);
            saveAllData();
            renderWorkHours(document.getElementById('workHoursVisitorSelect').value);
        }

        function renderWorkHours(visitor) {
            const container = document.getElementById('workHoursResult');
            container.style.display = 'block';
            if (!visitor) {
                container.innerHTML = '<span class="muted">ابتدا یک ویزیتور انتخاب کنید.</span>';
                return;
            }
            const records = data.workHours.filter(w => w.visitor === visitor).sort((a, b) => a.date.localeCompare(b.date));
            if (records.length === 0) {
                container.innerHTML = '<span class="muted">هنوز ساعت کاری برای این ویزیتور ثبت نشده است.</span>';
                return;
            }

            const groups = {};
            records.forEach(r => {
                const d = new Date(r.date + 'T00:00:00');
                const { jy, jm } = gregorianToJalali(d.getFullYear(), d.getMonth() + 1, d.getDate());
                const key = jy + '-' + String(jm).padStart(2, '0');
                if (!groups[key]) groups[key] = { jy, jm, items: [], totalHours: 0, totalVisits: 0 };
                const hours = computeWorkedHours(r.checkIn, r.checkOut);
                groups[key].items.push({ ...r, hours });
                groups[key].totalHours += hours;
                groups[key].totalVisits += (r.visits || 0);
            });

            let html = '';
            Object.keys(groups).sort().forEach(key => {
                const g = groups[key];
                html += `<div style="margin-bottom:16px;"><b>📅 ${jalaliMonthNames[g.jm - 1]} ${g.jy}</b>`;
                html += '<table><tr><th>تاریخ</th><th>ورود</th><th>خروج</th><th>ساعت کار</th><th>ویزیت</th><th></th></tr>';
                g.items.forEach(it => {
                    const dObj = new Date(it.date + 'T00:00:00');
                    const dateStr = dObj.toLocaleDateString('fa-IR');
                    const lowHours = it.hours < 8;
                    html += `<tr style="${lowHours ? 'background:#fff3cd;' : ''}">
                        <td>${dateStr}</td>
                        <td>${it.checkIn}</td>
                        <td>${it.checkOut}</td>
                        <td>${it.hours.toFixed(1)}</td>
                        <td>${it.visits || 0}</td>
                        <td><button onclick="deleteWorkHour(${it.id})" style="width:auto; padding:3px 7px; margin:0; background:#6c757d; font-size:11px;">حذف</button></td>
                    </tr>`;
                });
                html += `</table><div class="muted" style="margin-top:4px;">مجموع ساعت کار این ماه: <b>${g.totalHours.toFixed(1)}</b> ساعت | مجموع ویزیت این ماه: <b>${g.totalVisits}</b></div></div>`;
            });
            container.innerHTML = html;
        }

        fillDaySelect();
        fillTaskDaySelect();
        loadAllData();

        // پیش‌فرض تاریخ امروز برای بخش ساعت کاری
        (function setDefaultWorkHoursDate() {
            const dateInput = document.getElementById('workHoursDate');
            if (dateInput) {
                const now = new Date();
                const y = now.getFullYear();
                const m = String(now.getMonth() + 1).padStart(2, '0');
                const d = String(now.getDate()).padStart(2, '0');
                dateInput.value = `${y}-${m}-${d}`;
            }
        })();
