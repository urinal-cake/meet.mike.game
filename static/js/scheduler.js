// Initialize date picker with minimum date of tomorrow
document.addEventListener('DOMContentLoaded', function() {
    const dateInput = document.getElementById('appointmentDate');
    const timezoneSelect = document.getElementById('timezone');
    const nameInput = document.getElementById('name');
    const emailInput = document.getElementById('email');
    const companyInput = document.getElementById('company');
    const roleInput = document.getElementById('role');
    const bookButton = document.getElementById('bookButton');
    const confirmationMessage = document.getElementById('confirmationMessage');
    const errorMessage = document.getElementById('errorMessage');
    const meetingTypesContainer = document.getElementById('meetingTypes');
    const meetingTypeHint = document.getElementById('meetingTypeHint');
    const step2Section = document.getElementById('step2Section');
    const step3Section = document.getElementById('step3Section');
    const step4Section = document.getElementById('step4Section');
    const discussionDetails = document.getElementById('discussionDetails');
    const emailError = document.getElementById('emailError');

    let selectedTime = null;
    let selectedMeetingType = null;
    let flatpickrInstance = null;

    const meetingTypes = [
        {
            id: 'gdc-pleasant-talk',
            title: 'GDC: A Pleasant Talk',
            description: 'Have something you want to talk to me about specifically? A little more time will be good for us to run through it all.',
            durationMinutes: 40,
            mode: 'In-person (GDC)',
            dateStart: '2026-03-09',
            dateEnd: '2026-03-13',
            dailyStart: '09:00',
            dailyEnd: '17:00',
            blocked: [{ start: '11:45', end: '13:15' }],
        },
        {
            id: 'gdc-quick-chat',
            title: 'GDC: A Quick Chat',
            description: "Let's meet quickly, catch up, and discuss what's happening!",
            durationMinutes: 20,
            mode: 'In-person (GDC)',
            dateStart: '2026-03-09',
            dateEnd: '2026-03-13',
            dailyStart: '09:00',
            dailyEnd: '17:00',
            blocked: [{ start: '11:45', end: '13:15' }],
        },
        {
            id: 'gdc-lunch',
            title: 'GDC: Lunch',
            description: 'Meet in person for lunch during GDC.',
            durationMinutes: 60,
            mode: 'In-person (GDC)',
            dateStart: '2026-03-09',
            dateEnd: '2026-03-13',
            dailyStart: '12:00',
            dailyEnd: '13:00',
            blocked: [],
        },
        {
            id: 'gdc-dinner',
            title: 'GDC: Dinner',
            description: 'Meet in person for dinner during GDC.',
            durationMinutes: 120,
            mode: 'In-person (GDC)',
            dateStart: '2026-03-09',
            dateEnd: '2026-03-13',
            dailyStart: '17:30',
            dailyEnd: '19:30',
            blocked: [],
        },
    ];

    dateInput.disabled = true;
    step2Section.style.display = 'none';
    step3Section.style.display = 'none';
    step4Section.style.display = 'none';

    // Initialize Flatpickr
    flatpickrInstance = flatpickr(dateInput, {
        dateFormat: 'Y-m-d',
        minDate: null,
        maxDate: null,
        disable: [],
        clickOpens: false,
        onChange: function(selectedDates, dateStr, instance) {
            fetchAvailableSlots();
        }
    });

    // Set timezone to browser's timezone
    setUserTimezone();

    // Fetch available slots when timezone changes
    timezoneSelect.addEventListener('change', fetchAvailableSlots);

    // Enable/disable book button based on form completion
    [nameInput, emailInput, companyInput, roleInput, dateInput].forEach(input => {
        input.addEventListener('input', updateBookButtonState);
    });

    // Show Step 4 when all Step 3 fields are filled and email is valid
    [nameInput, emailInput, companyInput, roleInput].forEach(input => {
        input.addEventListener('input', function() {
            const name = nameInput.value.trim();
            const email = emailInput.value.trim();
            const company = companyInput.value.trim();
            const role = roleInput.value.trim();
            const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
            
            if (name && email && company && role && emailRegex.test(email)) {
                if (step4Section.style.display === 'none') {
                    step4Section.style.display = 'block';
                    setTimeout(() => {
                        step4Section.scrollIntoView({ behavior: 'smooth', block: 'start' });
                    }, 100);
                }
            } else {
                step4Section.style.display = 'none';
            }
        });
    });

    // Email validation on blur (when user leaves the field)
    emailInput.addEventListener('blur', function() {
        const email = emailInput.value.trim();
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        
        if (email && !emailRegex.test(email)) {
            emailInput.classList.add('is-invalid');
            emailError.style.display = 'block';
        } else {
            emailInput.classList.remove('is-invalid');
            emailError.style.display = 'none';
        }
    });

    // Clear email error when user starts typing
    emailInput.addEventListener('focus', function() {
        emailInput.classList.remove('is-invalid');
        emailError.style.display = 'none';
    });

    // Update book button state when discussion details change
    discussionDetails.addEventListener('input', updateBookButtonState);

    function formatDateRange(startDate, endDate) {
        const start = new Date(`${startDate}T00:00:00`);
        const end = new Date(`${endDate}T00:00:00`);
        const options = { month: 'short', day: 'numeric' };
        return `${start.toLocaleDateString(undefined, options)} – ${end.toLocaleDateString(undefined, options)}`;
    }

    renderMeetingTypes();
    function renderMeetingTypes() {
        meetingTypesContainer.innerHTML = '';

        meetingTypes.forEach((type) => {
            const card = document.createElement('button');
            card.type = 'button';
            card.className = 'meeting-type-card';
            card.dataset.meetingTypeId = type.id;

            card.innerHTML = `
                <div class="meeting-type-header">
                    <h6 class="meeting-type-title">${type.title}</h6>
                    <span class="meeting-type-duration">${type.durationMinutes} min</span>
                </div>
                <p class="meeting-type-description">${type.description}</p>
                <div class="meeting-type-meta">
                    <span><i class="fas fa-map-marker-alt"></i> ${type.mode}</span>
                    <span><i class="fas fa-calendar"></i> ${formatDateRange(type.dateStart, type.dateEnd)}</span>
                    <span><i class="fas fa-clock"></i> ${type.dailyStart} – ${type.dailyEnd}</span>
                </div>
            `;

            card.addEventListener('click', () => {
                document.querySelectorAll('.meeting-type-card').forEach((btn) => btn.classList.remove('selected'));
                card.classList.add('selected');
                selectedMeetingType = type;
                selectedTime = null;
                meetingTypeHint.textContent = 'Meeting type selected. Choose an available time below.';

                updateDateRangeForMeetingType(type);
                step2Section.style.display = 'block';
                step3Section.style.display = 'none';
                updateBookButtonState();
                fetchAvailableSlots();
                
                // Scroll to step 2 after it appears
                setTimeout(() => {
                    step2Section.scrollIntoView({ behavior: 'smooth', block: 'start' });
                }, 100);
            });

            meetingTypesContainer.appendChild(card);
        });
    }

    function updateDateRangeForMeetingType(type) {
        dateInput.disabled = false;
        flatpickrInstance.set('clickOpens', true);
        flatpickrInstance.set('minDate', type.dateStart);
        flatpickrInstance.set('maxDate', type.dateEnd);
        flatpickrInstance.set('defaultDate', type.dateStart);
        flatpickrInstance.clear();
        flatpickrInstance.setDate(null);
        flatpickrInstance.jumpToDate(type.dateStart);
    }

    function setUserTimezone() {
        // Lock to Pacific Time for GDC events in San Francisco
        timezoneSelect.value = 'America/Los_Angeles';
    }

    function fetchAvailableSlots() {
        const date = dateInput.value;
        const timezone = timezoneSelect.value;

        if (!selectedMeetingType) {
            const slotsContainer = document.getElementById('timeSlotsContainer');
            const timeSlotsDiv = document.getElementById('timeSlots');
            slotsContainer.style.display = 'block';
            timeSlotsDiv.innerHTML = '<div class="alert alert-info w-100">Select a meeting type to see available times.</div>';
            return;
        }

        if (!date) return;

        const loadingSpinner = document.getElementById('loadingSlots');
        const slotsContainer = document.getElementById('timeSlotsContainer');
        const timeSlotsDiv = document.getElementById('timeSlots');

        loadingSpinner.style.display = 'inline-block';
        slotsContainer.style.display = 'none';

        fetch('/api/availability', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                date: date,
                timezone: timezone,
                meeting_type_id: selectedMeetingType.id,
            }),
        })
        .then(response => {
            if (!response.ok) throw new Error('Failed to fetch availability');
            return response.json();
        })
        .then(slots => {
            timeSlotsDiv.innerHTML = '';
            selectedTime = null;

            if (!slots || slots.length === 0) {
                timeSlotsDiv.innerHTML = '<div class="alert alert-info w-100">No available slots for this date.</div>';
                slotsContainer.style.display = 'block';
                loadingSpinner.style.display = 'none';
                return;
            }

            slots.forEach(slot => {
                const button = document.createElement('button');
                button.type = 'button';
                button.className = 'time-slot';
                button.textContent = slot.time;
                button.disabled = !slot.available;
                button.dataset.time = slot.time;

                if (slot.available) {
                    button.addEventListener('click', function() {
                        document.querySelectorAll('.time-slot').forEach(b => b.classList.remove('selected'));
                        this.classList.add('selected');
                        selectedTime = this.dataset.time;
                        updateBookButtonState();
                        
                        // Show step 3 and scroll to it when time is selected
                        step3Section.style.display = 'block';
                        setTimeout(() => {
                            step3Section.scrollIntoView({ behavior: 'smooth', block: 'start' });
                        }, 100);
                    });
                }

                timeSlotsDiv.appendChild(button);
            });

            slotsContainer.style.display = 'block';
            loadingSpinner.style.display = 'none';
        })
        .catch(error => {
            console.error('Error:', error);
            errorMessage.textContent = 'Failed to load available slots. Please try again.';
            errorMessage.style.display = 'block';
            loadingSpinner.style.display = 'none';
        });
    }

    function updateBookButtonState() {
        const hasMeetingType = selectedMeetingType !== null;
        const hasName = nameInput.value.trim() !== '';
        const hasEmail = emailInput.value.trim() !== '';
        const hasCompany = companyInput.value.trim() !== '';
        const hasRole = roleInput.value.trim() !== '';
        const hasDate = dateInput.value !== '';
        const hasTime = selectedTime !== null;
        const hasDiscussion = discussionDetails.value.trim() !== '';

        bookButton.disabled = !(hasMeetingType && hasName && hasEmail && hasCompany && hasRole && hasDate && hasTime && hasDiscussion);
    }

    bookButton.addEventListener('click', bookAppointment);

    function bookAppointment() {
        if (!selectedMeetingType) {
            errorMessage.textContent = 'Please select a meeting type first.';
            errorMessage.style.display = 'block';
            return;
        }

        const name = nameInput.value.trim();
        const email = emailInput.value.trim();
        const company = companyInput.value.trim();
        const role = roleInput.value.trim();
        const date = dateInput.value;
        const time = selectedTime;
        const timezone = timezoneSelect.value;
        
        // Collect selected topics
        const selectedTopics = [];
        document.querySelectorAll('.form-check-input:checked').forEach(checkbox => {
            selectedTopics.push(checkbox.value);
        });
        const discussionText = discussionDetails.value.trim();

        if (!name || !email || !company || !role || !date || !time || !discussionText) {
            errorMessage.textContent = 'Please fill in all required fields.';
            errorMessage.style.display = 'block';
            return;
        }

        // Validate email
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) {
            errorMessage.textContent = 'Please enter a valid email address.';
            errorMessage.style.display = 'block';
            return;
        }

        bookButton.disabled = true;
        bookButton.innerHTML = '<span class="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span>Booking...';
        errorMessage.style.display = 'none';
        confirmationMessage.style.display = 'none';

        fetch('/api/book', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                meeting_type_id: selectedMeetingType.id,
                name: name,
                email: email,
                company: company,
                role: role,
                date: date,
                time: time,
                timezone: timezone,
                discussion_topics: selectedTopics,
                discussion_details: discussionText
            }),
        })
        .then(response => {
            if (!response.ok) throw new Error('Booking failed');
            return response.json();
        })
        .then(data => {
            if (data.success === 'true') {
                // Clear form
                nameInput.value = '';
                emailInput.value = '';
                companyInput.value = '';
                roleInput.value = '';
                
                confirmationMessage.style.display = 'block';
                setTimeout(() => {
                    // Scroll to confirmation
                    confirmationMessage.scrollIntoView({ behavior: 'smooth' });
                }, 100);

                // Reload available slots
                fetchAvailableSlots();
            } else {
                throw new Error('Unexpected response');
            }
        })
        .catch(error => {
            console.error('Error:', error);
            errorMessage.textContent = 'Failed to book appointment. Please try again.';
            errorMessage.style.display = 'block';
        })
        .finally(() => {
            bookButton.disabled = false;
            bookButton.innerHTML = '<i class="fas fa-calendar-check me-2"></i>Request Meeting';
            updateBookButtonState();
        });
    }
});
