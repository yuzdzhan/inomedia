<script lang="ts">
	import type { ActionData, PageData } from './$types';

	let { data, form }: { data: PageData; form: ActionData } = $props();

	let showCreateForm = $state(false);
	let activeClientId = $state<string | null>(null);
	let activeContactId = $state<string | null>(null);
	let activeNewContactClientId = $state<string | null>(null);

	function fieldError(field: string) {
		return (form as any)?.createClientErrors?.[field]?.[0];
	}

	function fieldValue(field: string) {
		return (form as any)?.createClientValues?.[field] ?? '';
	}

	function isActiveClientForm(clientId: string) {
		return (form as any)?.clientFormClientId === clientId;
	}

	function clientFieldError(clientId: string, field: string) {
		return isActiveClientForm(clientId) ? (form as any)?.clientFormErrors?.[field]?.[0] : null;
	}

	function clientValue(clientId: string, field: string, fallback: string | number | null) {
		return isActiveClientForm(clientId) ? ((form as any)?.clientFormValues?.[field] ?? fallback ?? '') : (fallback ?? '');
	}

	function contactFieldError(clientId: string, field: string) {
		return (form as any)?.contactFormClientId === clientId ? (form as any)?.contactFormErrors?.[field]?.[0] : null;
	}

	function contactFieldValue(clientId: string, field: string) {
		return (form as any)?.contactFormClientId === clientId ? ((form as any)?.contactFormValues?.[field] ?? '') : '';
	}

	function contactUpdateFieldError(clientId: string, contactId: string, field: string) {
		return (form as any)?.contactUpdateClientId === clientId && (form as any)?.contactUpdateContactId === contactId
			? (form as any)?.contactUpdateErrors?.[field]?.[0]
			: null;
	}

	function contactUpdateFieldValue(
		clientId: string,
		contactId: string,
		field: string,
		fallback: string | null
	) {
		return (form as any)?.contactUpdateClientId === clientId && (form as any)?.contactUpdateContactId === contactId
			? ((form as any)?.contactUpdateValues?.[field] ?? fallback ?? '')
			: (fallback ?? '');
	}

	function isExpanded(clientId: string) {
		return activeClientId === clientId;
	}

	function toggleClient(clientId: string) {
		activeClientId = activeClientId === clientId ? null : clientId;
		if (activeClientId !== clientId) {
			activeContactId = null;
			activeNewContactClientId = null;
		}
	}

	function isContactExpanded(contactId: string) {
		return activeContactId === contactId;
	}

	function toggleContact(contactId: string) {
		activeContactId = activeContactId === contactId ? null : contactId;
	}

	function isNewContactExpanded(clientId: string) {
		return activeNewContactClientId === clientId;
	}

	function toggleNewContact(clientId: string) {
		activeNewContactClientId = activeNewContactClientId === clientId ? null : clientId;
	}

	$effect(() => {
		if ((form as any)?.createClientSuccess) {
			showCreateForm = false;
		}

		const formClientId =
			(form as any)?.clientFormClientId ??
			(form as any)?.contactFormClientId ??
			(form as any)?.contactUpdateClientId ??
			null;

		if (formClientId) {
			activeClientId = formClientId;
		}

		if ((form as any)?.contactUpdateContactId) {
			activeContactId = (form as any).contactUpdateContactId;
		}

		if ((form as any)?.contactFormClientId) {
			activeNewContactClientId = (form as any).contactFormClientId;
		}
	});
</script>

<svelte:head>
	<title>Клиенти - Иномедия</title>
</svelte:head>

<div class="page-header">
	<div>
		<h1>Клиенти</h1>
		<p>Правни лица за проекти и фактуриране, с контакти и контрол на активния статус.</p>
	</div>
	{#if data.permissions.canCreateClient}
		<button class="btn-primary" onclick={() => (showCreateForm = !showCreateForm)}>
			{showCreateForm ? 'Отказ' : '+ Нов клиент'}
		</button>
	{/if}
</div>

{#if (form as any)?.createClientError}
	<div class="alert error">{(form as any).createClientError}</div>
{/if}

{#if (form as any)?.createClientSuccess}
	<div class="alert success">Клиентът е създаден.</div>
{/if}

{#if showCreateForm && data.permissions.canCreateClient}
	<section class="card create-card">
		<h2>Нов клиент</h2>
		<form method="POST" action="?/createClient">
			<div class="grid two">
				<div class="field">
					<label for="create-legalName">Правно наименование</label>
					<input id="create-legalName" name="legalName" type="text" value={fieldValue('legalName')} required />
					{#if fieldError('legalName')}<span class="error-text">{fieldError('legalName')}</span>{/if}
				</div>
				<div class="field">
					<label for="create-registrationNumber">ЕИК / Регистрационен номер</label>
					<input
						id="create-registrationNumber"
						name="registrationNumber"
						type="text"
						value={fieldValue('registrationNumber')}
					/>
					{#if fieldError('registrationNumber')}<span class="error-text">{fieldError('registrationNumber')}</span>{/if}
				</div>
				<div class="field">
					<label for="create-vatNumber">ДДС номер</label>
					<input id="create-vatNumber" name="vatNumber" type="text" value={fieldValue('vatNumber')} />
					{#if fieldError('vatNumber')}<span class="error-text">{fieldError('vatNumber')}</span>{/if}
				</div>
				<div class="field">
					<label for="create-defaultPaymentTermDays">Срок за плащане (дни)</label>
					<input
						id="create-defaultPaymentTermDays"
						name="defaultPaymentTermDays"
						type="number"
						min="1"
						max="365"
						value={fieldValue('defaultPaymentTermDays')}
					/>
					{#if fieldError('defaultPaymentTermDays')}<span class="error-text">{fieldError('defaultPaymentTermDays')}</span>{/if}
				</div>
			</div>

			<div class="field">
				<label for="create-billingAddress">Адрес за фактуриране</label>
				<textarea id="create-billingAddress" name="billingAddress" rows="4">{fieldValue('billingAddress')}</textarea>
				{#if fieldError('billingAddress')}<span class="error-text">{fieldError('billingAddress')}</span>{/if}
			</div>

			<div class="field short-field">
				<label for="create-status">Статус</label>
				<select id="create-status" name="status">
					<option value="active" selected={fieldValue('status') !== 'inactive'}>Активен</option>
					<option value="inactive" selected={fieldValue('status') === 'inactive'}>Неактивен</option>
				</select>
			</div>

			<button type="submit" class="btn-primary">Създай клиент</button>
		</form>
	</section>
{/if}

{#if (form as any)?.clientFormError}
	<div class="alert error">{(form as any).clientFormError}</div>
{/if}

{#if (form as any)?.clientFormSuccess}
	<div class="alert success">Клиентът е обновен.</div>
{/if}

{#if (form as any)?.contactFormError}
	<div class="alert error">{(form as any).contactFormError}</div>
{/if}

{#if (form as any)?.contactFormSuccess}
	<div class="alert success">Контактът е добавен.</div>
{/if}

{#if (form as any)?.contactUpdateError}
	<div class="alert error">{(form as any).contactUpdateError}</div>
{/if}

{#if (form as any)?.contactUpdateSuccess}
	<div class="alert success">Контактът е обновен.</div>
{/if}

<div class="client-list">
	{#each data.clients as client}
		<section class="card client-card">
			<button type="button" class="client-toggle" onclick={() => toggleClient(client.id)} aria-expanded={isExpanded(client.id)}>
				<div class="client-head">
					<div class="client-summary">
						<div class="title-row">
							<h2>{client.legalName}</h2>
							{#if client.isProtectedSystem}
								<span class="badge protected">Защитен вътрешен клиент</span>
							{/if}
							<span class="badge" class:active={client.status === 'active'} class:inactive={client.status === 'inactive'}>
								{client.status === 'active' ? 'Активен' : 'Неактивен'}
							</span>
						</div>

						<div class="client-meta">
							<div>
								<span class="meta-label">ЕИК</span>
								<span class="meta-value">{client.registrationNumber ?? 'Няма'}</span>
							</div>
							<div>
								<span class="meta-label">Проекти</span>
								<span class="meta-value">{client._count.projects}</span>
							</div>
						</div>

						{#if client.status === 'inactive'}
							<p class="inline-note">Не може да получава нова фактурируема активност.</p>
						{/if}
					</div>

					<span class="expand-indicator" class:expanded={isExpanded(client.id)}>
						{isExpanded(client.id) ? 'Скрий' : 'Отвори'}
					</span>
				</div>
			</button>

			{#if isExpanded(client.id)}
				<form method="POST" action="?/updateClient">
					<input type="hidden" name="clientId" value={client.id} />
					<div class="grid two">
						<div class="field">
							<label for={'legalName-' + client.id}>Правно наименование</label>
							<input
								id={'legalName-' + client.id}
								name="legalName"
								type="text"
								value={clientValue(client.id, 'legalName', client.legalName)}
								required
								disabled={client.isProtectedSystem || !data.permissions.canEditBilling}
							/>
							{#if clientFieldError(client.id, 'legalName')}<span class="error-text">{clientFieldError(client.id, 'legalName')}</span>{/if}
						</div>
						<div class="field">
							<label for={'registrationNumber-' + client.id}>ЕИК / Регистрационен номер</label>
							<input
								id={'registrationNumber-' + client.id}
								name="registrationNumber"
								type="text"
								value={clientValue(client.id, 'registrationNumber', client.registrationNumber)}
								disabled={client.isProtectedSystem || !data.permissions.canEditBilling}
							/>
							{#if clientFieldError(client.id, 'registrationNumber')}<span class="error-text">{clientFieldError(client.id, 'registrationNumber')}</span>{/if}
						</div>
						<div class="field">
							<label for={'vatNumber-' + client.id}>ДДС номер</label>
							<input
								id={'vatNumber-' + client.id}
								name="vatNumber"
								type="text"
								value={clientValue(client.id, 'vatNumber', client.vatNumber)}
								disabled={client.isProtectedSystem || !data.permissions.canEditBilling}
							/>
							{#if clientFieldError(client.id, 'vatNumber')}<span class="error-text">{clientFieldError(client.id, 'vatNumber')}</span>{/if}
						</div>
						<div class="field">
							<label for={'defaultPaymentTermDays-' + client.id}>Срок за плащане (дни)</label>
							<input
								id={'defaultPaymentTermDays-' + client.id}
								name="defaultPaymentTermDays"
								type="number"
								min="1"
								max="365"
								value={clientValue(client.id, 'defaultPaymentTermDays', client.defaultPaymentTermDays)}
								disabled={client.isProtectedSystem || !data.permissions.canEditBilling}
							/>
							{#if clientFieldError(client.id, 'defaultPaymentTermDays')}<span class="error-text">{clientFieldError(client.id, 'defaultPaymentTermDays')}</span>{/if}
						</div>
					</div>

					<div class="grid two align-end">
						<div class="field">
							<label for={'billingAddress-' + client.id}>Адрес за фактуриране</label>
							<textarea
								id={'billingAddress-' + client.id}
								name="billingAddress"
								rows="4"
								disabled={client.isProtectedSystem || !data.permissions.canEditBilling}
							>{clientValue(client.id, 'billingAddress', client.billingAddress)}</textarea>
							{#if clientFieldError(client.id, 'billingAddress')}<span class="error-text">{clientFieldError(client.id, 'billingAddress')}</span>{/if}
						</div>
						<div class="field short-field">
							<label for={'status-' + client.id}>Статус</label>
							<select
								id={'status-' + client.id}
								name="status"
								disabled={!data.permissions.canChangeLifecycle || client.isProtectedSystem}
							>
								<option value="active" selected={clientValue(client.id, 'status', client.status) === 'active'}>
									Активен
								</option>
								<option value="inactive" selected={clientValue(client.id, 'status', client.status) === 'inactive'}>
									Неактивен
								</option>
							</select>
							{#if !data.permissions.canChangeLifecycle}
								<small>Само мениджър и администратор могат да променят статуса.</small>
							{/if}
						</div>
					</div>

					{#if !client.isProtectedSystem && clientValue(client.id, 'billingAddress', client.billingAddress)}
						<div class="address-preview">
							<div class="meta-label">Преглед на адреса</div>
							<div class="address-preview-text">{clientValue(client.id, 'billingAddress', client.billingAddress)}</div>
						</div>
					{/if}

					{#if client.isProtectedSystem}
						<p class="hint">Системният вътрешен клиент остава заключен, за да не се нарушат основните правила на приложението.</p>
					{/if}

					{#if !client.isProtectedSystem && data.permissions.canEditBilling}
						<button type="submit" class="btn-primary">Запази клиента</button>
					{/if}
				</form>

				<div class="contacts-block">
					<div class="section-head">
						<div>
							<h3>Контакти</h3>
							<p>Контактите са по избор и не заменят правното лице за фактуриране.</p>
						</div>
					</div>

					{#if client.contacts.length > 0}
						<div class="contacts-list">
							{#each client.contacts as contact}
								<section class="contact-shell">
									<button
										type="button"
										class="contact-toggle"
										onclick={() => toggleContact(contact.id)}
										aria-expanded={isContactExpanded(contact.id)}
									>
										<div class="contact-summary">
											<div class="contact-name">{contact.name}</div>
											<div class="contact-subline">
												{contact.roleTitle ?? 'Без роля'}
												{#if contact.email}
													<span>• {contact.email}</span>
												{/if}
											</div>
										</div>
										<span class="expand-indicator" class:expanded={isContactExpanded(contact.id)}>
											{isContactExpanded(contact.id) ? 'Скрий' : 'Отвори'}
										</span>
									</button>

									{#if isContactExpanded(contact.id)}
										<form method="POST" action="?/updateContact" class="contact-card">
											<input type="hidden" name="clientId" value={client.id} />
											<input type="hidden" name="contactId" value={contact.id} />
											<div class="grid two">
												<div class="field">
													<label for={'contact-name-' + contact.id}>Име</label>
													<input
														id={'contact-name-' + contact.id}
														name="name"
														type="text"
														value={contactUpdateFieldValue(client.id, contact.id, 'name', contact.name)}
														required
														disabled={!data.permissions.canManageContacts || client.isProtectedSystem}
													/>
													{#if contactUpdateFieldError(client.id, contact.id, 'name')}<span class="error-text">{contactUpdateFieldError(client.id, contact.id, 'name')}</span>{/if}
												</div>
												<div class="field">
													<label for={'contact-role-' + contact.id}>Роля</label>
													<input
														id={'contact-role-' + contact.id}
														name="roleTitle"
														type="text"
														value={contactUpdateFieldValue(client.id, contact.id, 'roleTitle', contact.roleTitle)}
														disabled={!data.permissions.canManageContacts || client.isProtectedSystem}
													/>
													{#if contactUpdateFieldError(client.id, contact.id, 'roleTitle')}<span class="error-text">{contactUpdateFieldError(client.id, contact.id, 'roleTitle')}</span>{/if}
												</div>
												<div class="field">
													<label for={'contact-email-' + contact.id}>Имейл</label>
													<input
														id={'contact-email-' + contact.id}
														name="email"
														type="email"
														value={contactUpdateFieldValue(client.id, contact.id, 'email', contact.email)}
														disabled={!data.permissions.canManageContacts || client.isProtectedSystem}
													/>
													{#if contactUpdateFieldError(client.id, contact.id, 'email')}<span class="error-text">{contactUpdateFieldError(client.id, contact.id, 'email')}</span>{/if}
												</div>
												<div class="field">
													<label for={'contact-phone-' + contact.id}>Телефон</label>
													<input
														id={'contact-phone-' + contact.id}
														name="phone"
														type="text"
														value={contactUpdateFieldValue(client.id, contact.id, 'phone', contact.phone)}
														disabled={!data.permissions.canManageContacts || client.isProtectedSystem}
													/>
													{#if contactUpdateFieldError(client.id, contact.id, 'phone')}<span class="error-text">{contactUpdateFieldError(client.id, contact.id, 'phone')}</span>{/if}
												</div>
											</div>
											{#if data.permissions.canManageContacts && !client.isProtectedSystem}
												<button type="submit" class="btn-secondary">Запази контакт</button>
											{/if}
										</form>
									{/if}
								</section>
							{/each}
						</div>
					{:else}
						<p class="empty-state">Няма добавени контакти.</p>
					{/if}

					{#if data.permissions.canManageContacts && !client.isProtectedSystem}
						<section class="contact-shell">
							<button
								type="button"
								class="contact-toggle add-contact-toggle"
								onclick={() => toggleNewContact(client.id)}
								aria-expanded={isNewContactExpanded(client.id)}
							>
								<div class="contact-summary">
									<div class="contact-name">Нов контакт</div>
									<div class="contact-subline">Добавете име, роля, имейл и телефон при нужда.</div>
								</div>
								<span class="expand-indicator" class:expanded={isNewContactExpanded(client.id)}>
									{isNewContactExpanded(client.id) ? 'Скрий' : 'Отвори'}
								</span>
							</button>

							{#if isNewContactExpanded(client.id)}
								<form method="POST" action="?/addContact" class="contact-card create-contact">
									<input type="hidden" name="clientId" value={client.id} />
									<div class="grid two">
										<div class="field">
											<label for={'new-contact-name-' + client.id}>Име</label>
											<input
												id={'new-contact-name-' + client.id}
												name="name"
												type="text"
												value={contactFieldValue(client.id, 'name')}
												required
											/>
											{#if contactFieldError(client.id, 'name')}<span class="error-text">{contactFieldError(client.id, 'name')}</span>{/if}
										</div>
										<div class="field">
											<label for={'new-contact-role-' + client.id}>Роля</label>
											<input id={'new-contact-role-' + client.id} name="roleTitle" type="text" value={contactFieldValue(client.id, 'roleTitle')} />
											{#if contactFieldError(client.id, 'roleTitle')}<span class="error-text">{contactFieldError(client.id, 'roleTitle')}</span>{/if}
										</div>
										<div class="field">
											<label for={'new-contact-email-' + client.id}>Имейл</label>
											<input id={'new-contact-email-' + client.id} name="email" type="email" value={contactFieldValue(client.id, 'email')} />
											{#if contactFieldError(client.id, 'email')}<span class="error-text">{contactFieldError(client.id, 'email')}</span>{/if}
										</div>
										<div class="field">
											<label for={'new-contact-phone-' + client.id}>Телефон</label>
											<input id={'new-contact-phone-' + client.id} name="phone" type="text" value={contactFieldValue(client.id, 'phone')} />
											{#if contactFieldError(client.id, 'phone')}<span class="error-text">{contactFieldError(client.id, 'phone')}</span>{/if}
										</div>
									</div>
									<button type="submit" class="btn-secondary">Добави контакт</button>
								</form>
							{/if}
						</section>
					{/if}
				</div>
			{/if}
		</section>
	{/each}
</div>

<style>
	.page-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 16px;
		margin-bottom: 24px;
	}

	h1 {
		font-size: 1.5rem;
		font-weight: 700;
		color: #0f172a;
	}

	h2,
	h3 {
		color: #0f172a;
	}

	p {
		color: #64748b;
		margin-top: 6px;
	}

	.client-list {
		display: grid;
		gap: 32px;
	}

	.card {
		background: #fff;
		border-radius: 12px;
		box-shadow: 0 2px 12px rgba(15, 23, 42, 0.06);
	}

	.create-card {
		padding: 24px;
	}

	.client-card {
		display: flex;
		flex-direction: column;
		gap: 0;
		overflow: hidden;
	}

	.client-toggle {
		width: 100%;
		border: none;
		background: transparent;
		padding: 24px;
		text-align: left;
		cursor: pointer;
	}

	.client-head {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: 20px;
	}

	.client-summary {
		display: flex;
		flex-direction: column;
		gap: 10px;
	}

	.client-meta {
		display: flex;
		flex-wrap: wrap;
		gap: 18px;
	}

	.meta-label {
		display: block;
		font-size: 0.75rem;
		font-weight: 700;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		color: #64748b;
		margin-bottom: 4px;
	}

	.meta-value {
		font-size: 0.98rem;
		font-weight: 600;
		color: #0f172a;
	}

	.title-row {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 10px;
	}

	.expand-indicator {
		flex-shrink: 0;
		padding-top: 4px;
		font-size: 0.85rem;
		font-weight: 700;
		color: #2563eb;
	}

	.expand-indicator.expanded {
		color: #1d4ed8;
	}

	form {
		display: flex;
		flex-direction: column;
		gap: 18px;
		padding: 0 24px 24px;
	}

	.grid {
		display: grid;
		gap: 16px;
	}

	.grid.two {
		grid-template-columns: repeat(2, minmax(0, 1fr));
	}

	.align-end {
		align-items: end;
	}

	.field {
		display: flex;
		flex-direction: column;
		gap: 6px;
	}

	.short-field {
		max-width: 260px;
	}

	label {
		font-size: 0.875rem;
		font-weight: 600;
		color: #334155;
	}

	input,
	select,
	textarea {
		width: 100%;
		border: 1px solid #cbd5e1;
		border-radius: 8px;
		padding: 10px 12px;
		font: inherit;
		color: #0f172a;
		background: #fff;
	}

	input:focus,
	select:focus,
	textarea:focus {
		outline: none;
		border-color: #2563eb;
		box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.12);
	}

	input:disabled,
	select:disabled,
	textarea:disabled {
		background: #f8fafc;
		color: #64748b;
	}

	textarea {
		resize: vertical;
		min-height: 6.5rem;
		white-space: pre-wrap;
	}

	.address-preview {
		border: 1px solid #e2e8f0;
		border-radius: 10px;
		padding: 14px 16px;
		background: #f8fafc;
	}

	.address-preview-text {
		color: #0f172a;
		white-space: pre-wrap;
		line-height: 1.5;
	}

	.contacts-block {
		border-top: 1px solid #e2e8f0;
		padding: 24px;
	}

	.section-head {
		margin-bottom: 16px;
	}

	.contacts-list {
		display: grid;
		gap: 16px;
		margin-bottom: 16px;
	}

	.contact-shell {
		border: 1px solid #e2e8f0;
		border-radius: 10px;
		background: #f8fafc;
		overflow: hidden;
	}

	.contact-toggle {
		width: 100%;
		border: none;
		background: transparent;
		padding: 16px;
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: 16px;
		text-align: left;
		cursor: pointer;
	}

	.contact-summary {
		display: flex;
		flex-direction: column;
		gap: 6px;
	}

	.contact-name {
		font-weight: 700;
		color: #0f172a;
	}

	.contact-subline {
		font-size: 0.88rem;
		color: #64748b;
		display: flex;
		flex-wrap: wrap;
		gap: 6px;
	}

	.contact-card {
		border-top: 1px solid #e2e8f0;
		padding-top: 16px;
		background: #f8fafc;
	}

	.add-contact-toggle {
		background: #f8fafc;
	}

	.inline-note,
	.hint,
	small,
	.empty-state {
		color: #64748b;
		font-size: 0.84rem;
	}

	.inline-note {
		margin-top: 0;
	}

	.badge {
		display: inline-flex;
		align-items: center;
		border-radius: 999px;
		padding: 4px 10px;
		font-size: 0.8rem;
		font-weight: 600;
	}

	.badge.active {
		background: #dcfce7;
		color: #166534;
	}

	.badge.inactive {
		background: #e2e8f0;
		color: #475569;
	}

	.badge.protected {
		background: #dbeafe;
		color: #1d4ed8;
	}

	.alert {
		padding: 12px 14px;
		border-radius: 8px;
		margin-bottom: 18px;
		font-size: 0.92rem;
	}

	.alert.error {
		background: #fef2f2;
		border: 1px solid #fecaca;
		color: #b91c1c;
	}

	.alert.success {
		background: #f0fdf4;
		border: 1px solid #bbf7d0;
		color: #166534;
	}

	.error-text {
		font-size: 0.8rem;
		color: #dc2626;
	}

	.btn-primary,
	.btn-secondary {
		border: none;
		border-radius: 8px;
		padding: 10px 16px;
		font: inherit;
		font-weight: 600;
		cursor: pointer;
		align-self: flex-start;
	}

	.btn-primary {
		background: #2563eb;
		color: #fff;
	}

	.btn-primary:hover {
		background: #1d4ed8;
	}

	.btn-secondary {
		background: #e2e8f0;
		color: #0f172a;
	}

	.btn-secondary:hover {
		background: #cbd5e1;
	}

	@media (max-width: 900px) {
		.page-header {
			flex-direction: column;
			align-items: stretch;
		}

		.grid.two {
			grid-template-columns: 1fr;
		}

		.short-field {
			max-width: none;
		}

		.client-toggle,
		form,
		.contacts-block {
			padding-left: 18px;
			padding-right: 18px;
		}

		.contact-toggle {
			padding: 14px;
		}

		.btn-primary,
		.btn-secondary {
			width: 100%;
		}
	}
</style>
