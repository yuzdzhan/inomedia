<script lang="ts">
	import type { ActionData, PageData } from './$types';
	import Icon from '$lib/components/Icon.svelte';

	let { data, form }: { data: PageData; form: ActionData } = $props();

	let showCreateForm = $state(false);
	let activeClientId = $state<string | null>(null);
	let activeContactId = $state<string | null>(null);
	let activeNewContactClientId = $state<string | null>(null);
	let filterStatus = $state<'all' | 'active' | 'inactive'>('all');

	const clientColors = ['#4f46e5', '#0891b2', '#dc2626', '#ca8a04', '#059669', '#7c3aed'];

	function colorForClient(index: number) {
		return clientColors[index % clientColors.length];
	}

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

	function contactUpdateFieldValue(clientId: string, contactId: string, field: string, fallback: string | null) {
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

	const filteredClients = $derived(
		data.clients.filter((c: any) => filterStatus === 'all' || c.status === filterStatus)
	);

	const activeCount = $derived(data.clients.filter((c: any) => c.status === 'active').length);
	const inactiveCount = $derived(data.clients.filter((c: any) => c.status === 'inactive').length);
</script>

<svelte:head>
	<title>Клиенти – Иномедия</title>
</svelte:head>

<div class="page-header">
	<div>
		<h1 class="page-title">Клиенти</h1>
		<p class="page-sub">{data.clients.length} клиента · {filteredClients.filter((c: any) => c._count.projects > 0).reduce((s: number, c: any) => s + c._count.projects, 0)} проекта общо</p>
	</div>
	<div class="page-header-actions">
		<button class="btn btn-secondary btn-sm"><Icon name="download" size={13}/>Експорт</button>
		{#if data.permissions.canCreateClient}
			<button class="btn btn-primary btn-sm" onclick={() => (showCreateForm = !showCreateForm)}>
				<Icon name="plus" size={13}/>{showCreateForm ? 'Отказ' : 'Нов клиент'}
			</button>
		{/if}
	</div>
</div>

<!-- Alerts -->
{#if (form as any)?.createClientSuccess}
	<div class="alert warning" style="margin-bottom:12px;">Клиентът е създаден успешно.</div>
{/if}
{#if (form as any)?.createClientError}
	<div class="alert danger" style="margin-bottom:12px;">{(form as any).createClientError}</div>
{/if}
{#if (form as any)?.clientFormSuccess}
	<div class="alert warning" style="margin-bottom:12px;">Клиентът е обновен.</div>
{/if}
{#if (form as any)?.clientFormError}
	<div class="alert danger" style="margin-bottom:12px;">{(form as any).clientFormError}</div>
{/if}
{#if (form as any)?.contactFormSuccess}
	<div class="alert warning" style="margin-bottom:12px;">Контактът е добавен.</div>
{/if}
{#if (form as any)?.contactFormError}
	<div class="alert danger" style="margin-bottom:12px;">{(form as any).contactFormError}</div>
{/if}
{#if (form as any)?.contactUpdateSuccess}
	<div class="alert warning" style="margin-bottom:12px;">Контактът е обновен.</div>
{/if}
{#if (form as any)?.contactUpdateError}
	<div class="alert danger" style="margin-bottom:12px;">{(form as any).contactUpdateError}</div>
{/if}

<!-- Create form -->
{#if showCreateForm && data.permissions.canCreateClient}
	<div class="card" style="margin-bottom:16px;">
		<div class="card-header">
			<h3 class="card-title">Нов клиент</h3>
		</div>
		<form method="POST" action="?/createClient" style="padding:16px;">
			<div style="display:grid; grid-template-columns:1fr 1fr; gap:12px; margin-bottom:12px;">
				<div class="field">
					<label class="label" for="create-legalName">Правно наименование</label>
					<input class="input" id="create-legalName" name="legalName" type="text" value={fieldValue('legalName')} required />
					{#if fieldError('legalName')}<span style="color:var(--danger); font-size:11px;">{fieldError('legalName')}</span>{/if}
				</div>
				<div class="field">
					<label class="label" for="create-registrationNumber">ЕИК</label>
					<input class="input" id="create-registrationNumber" name="registrationNumber" type="text" value={fieldValue('registrationNumber')} />
					{#if fieldError('registrationNumber')}<span style="color:var(--danger); font-size:11px;">{fieldError('registrationNumber')}</span>{/if}
				</div>
				<div class="field">
					<label class="label" for="create-vatNumber">ДДС номер</label>
					<input class="input" id="create-vatNumber" name="vatNumber" type="text" value={fieldValue('vatNumber')} />
					{#if fieldError('vatNumber')}<span style="color:var(--danger); font-size:11px;">{fieldError('vatNumber')}</span>{/if}
				</div>
				<div class="field">
					<label class="label" for="create-defaultPaymentTermDays">Срок за плащане (дни)</label>
					<input class="input" id="create-defaultPaymentTermDays" name="defaultPaymentTermDays" type="number" min="1" max="365" value={fieldValue('defaultPaymentTermDays')} />
					{#if fieldError('defaultPaymentTermDays')}<span style="color:var(--danger); font-size:11px;">{fieldError('defaultPaymentTermDays')}</span>{/if}
				</div>
				<div class="field" style="grid-column: 1 / -1;">
					<label class="label" for="create-mol">МОЛ</label>
					<input class="input" id="create-mol" name="mol" type="text" value={fieldValue('mol')} />
					{#if fieldError('mol')}<span style="color:var(--danger); font-size:11px;">{fieldError('mol')}</span>{/if}
				</div>
			</div>
			<div class="field" style="margin-bottom:12px;">
				<label class="label" for="create-billingAddress">Адрес за фактуриране</label>
				<textarea class="input" id="create-billingAddress" name="billingAddress" rows="3" style="resize:vertical;">{fieldValue('billingAddress')}</textarea>
			</div>
			<div class="field" style="margin-bottom:16px; max-width:200px;">
				<label class="label" for="create-status">Статус</label>
				<select class="select" id="create-status" name="status">
					<option value="active" selected={fieldValue('status') !== 'inactive'}>Активен</option>
					<option value="inactive" selected={fieldValue('status') === 'inactive'}>Неактивен</option>
				</select>
			</div>
			<div class="row gap-2">
				<button type="submit" class="btn btn-primary btn-sm">Създай клиент</button>
				<button type="button" class="btn btn-ghost btn-sm" onclick={() => (showCreateForm = false)}>Отказ</button>
			</div>
		</form>
	</div>
{/if}

<!-- Filter row -->
<div class="row-between" style="margin-bottom:16px;">
	<div class="chip-group">
		<button class="chip {filterStatus === 'all' ? 'active' : ''}" onclick={() => (filterStatus = 'all')}>Всички · {data.clients.length}</button>
		<button class="chip {filterStatus === 'active' ? 'active' : ''}" onclick={() => (filterStatus = 'active')}>Активни · {activeCount}</button>
		<button class="chip {filterStatus === 'inactive' ? 'active' : ''}" onclick={() => (filterStatus = 'inactive')}>Неактивни · {inactiveCount}</button>
	</div>
</div>

<!-- Main table -->
<div class="card">
	<table class="tbl">
		<thead>
			<tr>
				<th style="width:24%">Клиент</th>
				<th>ЕИК</th>
				<th>ДДС номер</th>
				<th>Срок</th>
				<th>Проекти</th>
				<th>Статус</th>
				<th></th>
			</tr>
		</thead>
		<tbody>
			{#each filteredClients as client, i}
				<tr style={isExpanded(client.id) ? 'background:var(--accent-subtle);' : ''}>
					<td>
						<div class="row gap-2">
							<div class="sb-avatar" style="width:24px; height:24px; font-size:9px; background:{colorForClient(i)};">{client.legalName[0]}</div>
							<span style="font-weight:500;">{client.legalName}</span>
						</div>
					</td>
					<td class="amount muted">{client.registrationNumber ?? '—'}</td>
					<td class="amount muted">{client.vatNumber ?? '—'}</td>
					<td class="amount">{client.defaultPaymentTermDays ?? '—'}{client.defaultPaymentTermDays ? ' дни' : ''}</td>
					<td><span class="badge outline">{client._count.projects} активни</span></td>
					<td>
						{#if client.status === 'active'}
							<span class="badge task-done">Активен</span>
						{:else}
							<span class="badge task-cancelled">Неактивен</span>
						{/if}
					</td>
					<td>
						<button class="topbar-icon-btn" onclick={() => toggleClient(client.id)} aria-label="Редактирай">
							<Icon name={isExpanded(client.id) ? 'chevron-down' : 'more'} size={13}/>
						</button>
					</td>
				</tr>

				{#if isExpanded(client.id)}
					<tr>
						<td colspan="7" style="padding:0; background:var(--surface);">
							<div style="padding:20px; border-top:1px solid var(--border);">
								<!-- Edit form -->
								<form method="POST" action="?/updateClient">
									<input type="hidden" name="clientId" value={client.id} />
									<div style="display:grid; grid-template-columns:1fr 1fr; gap:12px; margin-bottom:12px;">
										<div class="field">
											<label class="label" for="legalName-{client.id}">Правно наименование</label>
											<input class="input" id="legalName-{client.id}" name="legalName" type="text"
												value={clientValue(client.id, 'legalName', client.legalName)}
												required
												disabled={client.isProtectedSystem || !data.permissions.canEditBilling} />
											{#if clientFieldError(client.id, 'legalName')}<span style="color:var(--danger); font-size:11px;">{clientFieldError(client.id, 'legalName')}</span>{/if}
										</div>
										<div class="field">
											<label class="label" for="registrationNumber-{client.id}">ЕИК</label>
											<input class="input" id="registrationNumber-{client.id}" name="registrationNumber" type="text"
												value={clientValue(client.id, 'registrationNumber', client.registrationNumber)}
												disabled={client.isProtectedSystem || !data.permissions.canEditBilling} />
										</div>
										<div class="field">
											<label class="label" for="vatNumber-{client.id}">ДДС номер</label>
											<input class="input" id="vatNumber-{client.id}" name="vatNumber" type="text"
												value={clientValue(client.id, 'vatNumber', client.vatNumber)}
												disabled={client.isProtectedSystem || !data.permissions.canEditBilling} />
										</div>
										<div class="field">
											<label class="label" for="defaultPaymentTermDays-{client.id}">Срок за плащане (дни)</label>
											<input class="input" id="defaultPaymentTermDays-{client.id}" name="defaultPaymentTermDays" type="number" min="1" max="365"
												value={clientValue(client.id, 'defaultPaymentTermDays', client.defaultPaymentTermDays)}
												disabled={client.isProtectedSystem || !data.permissions.canEditBilling} />
										</div>
										<div class="field" style="grid-column: 1 / -1;">
											<label class="label" for="mol-{client.id}">МОЛ</label>
											<input class="input" id="mol-{client.id}" name="mol" type="text"
												value={clientValue(client.id, 'mol', client.mol)}
												disabled={client.isProtectedSystem || !data.permissions.canEditBilling} />
										</div>
									</div>
									<div class="field" style="margin-bottom:12px;">
										<label class="label" for="billingAddress-{client.id}">Адрес за фактуриране</label>
										<textarea class="input" id="billingAddress-{client.id}" name="billingAddress" rows="3" style="resize:vertical;"
											disabled={client.isProtectedSystem || !data.permissions.canEditBilling}>{clientValue(client.id, 'billingAddress', client.billingAddress)}</textarea>
									</div>
									<div style="display:grid; grid-template-columns:200px 1fr; gap:12px; align-items:end; margin-bottom:16px;">
										<div class="field">
											<label class="label" for="status-{client.id}">Статус</label>
											<select class="select" id="status-{client.id}" name="status"
												disabled={!data.permissions.canChangeLifecycle || client.isProtectedSystem}>
												<option value="active" selected={clientValue(client.id, 'status', client.status) === 'active'}>Активен</option>
												<option value="inactive" selected={clientValue(client.id, 'status', client.status) === 'inactive'}>Неактивен</option>
											</select>
										</div>
									</div>
									{#if !client.isProtectedSystem && data.permissions.canEditBilling}
										<div class="row gap-2" style="margin-bottom:24px;">
											<button type="submit" class="btn btn-primary btn-sm">Запази клиента</button>
											<button type="button" class="btn btn-ghost btn-sm" onclick={() => toggleClient(client.id)}>Затвори</button>
										</div>
									{:else}
										<button type="button" class="btn btn-ghost btn-sm" style="margin-bottom:24px;" onclick={() => toggleClient(client.id)}>Затвори</button>
									{/if}
								</form>

								<!-- Contacts -->
								{#if data.permissions.canManageContacts}
									<div style="border-top:1px solid var(--border); padding-top:16px;">
										<div style="font-size:12px; font-weight:600; text-transform:uppercase; letter-spacing:0.06em; color:var(--text-muted); font-family:var(--font-mono); margin-bottom:12px;">Контакти</div>
										{#each client.contacts as contact}
											<div style="border:1px solid var(--border); border-radius:var(--r-md); margin-bottom:8px; overflow:hidden;">
												<button type="button" style="width:100%; padding:10px 14px; text-align:left; display:flex; justify-content:space-between; align-items:center; background:var(--bg-elevated);"
													onclick={() => toggleContact(contact.id)}>
													<div>
														<span style="font-weight:500; font-size:13px;">{contact.name}</span>
														<span class="muted" style="font-size:12px; margin-left:8px;">{contact.roleTitle ?? 'Без роля'}{contact.email ? ' · ' + contact.email : ''}</span>
													</div>
													<Icon name={isContactExpanded(contact.id) ? 'chevron-down' : 'chevron-right'} size={13}/>
												</button>
												{#if isContactExpanded(contact.id)}
													<form method="POST" action="?/updateContact" style="padding:14px; background:var(--surface); border-top:1px solid var(--border);">
														<input type="hidden" name="clientId" value={client.id} />
														<input type="hidden" name="contactId" value={contact.id} />
														<div style="display:grid; grid-template-columns:1fr 1fr; gap:10px; margin-bottom:10px;">
															<div class="field">
																<label class="label" for="contact-name-{contact.id}">Име</label>
																<input class="input" id="contact-name-{contact.id}" name="name" type="text"
																	value={contactUpdateFieldValue(client.id, contact.id, 'name', contact.name)} required
																	disabled={!data.permissions.canManageContacts || client.isProtectedSystem} />
																{#if contactUpdateFieldError(client.id, contact.id, 'name')}<span style="color:var(--danger); font-size:11px;">{contactUpdateFieldError(client.id, contact.id, 'name')}</span>{/if}
															</div>
															<div class="field">
																<label class="label" for="contact-role-{contact.id}">Роля</label>
																<input class="input" id="contact-role-{contact.id}" name="roleTitle" type="text"
																	value={contactUpdateFieldValue(client.id, contact.id, 'roleTitle', contact.roleTitle)}
																	disabled={!data.permissions.canManageContacts || client.isProtectedSystem} />
															</div>
															<div class="field">
																<label class="label" for="contact-email-{contact.id}">Имейл</label>
																<input class="input" id="contact-email-{contact.id}" name="email" type="email"
																	value={contactUpdateFieldValue(client.id, contact.id, 'email', contact.email)}
																	disabled={!data.permissions.canManageContacts || client.isProtectedSystem} />
															</div>
															<div class="field">
																<label class="label" for="contact-phone-{contact.id}">Телефон</label>
																<input class="input" id="contact-phone-{contact.id}" name="phone" type="text"
																	value={contactUpdateFieldValue(client.id, contact.id, 'phone', contact.phone)}
																	disabled={!data.permissions.canManageContacts || client.isProtectedSystem} />
															</div>
														</div>
														{#if data.permissions.canManageContacts && !client.isProtectedSystem}
															<button type="submit" class="btn btn-secondary btn-sm">Запази контакт</button>
														{/if}
													</form>
												{/if}
											</div>
										{/each}

										{#if !client.isProtectedSystem}
											<div style="border:1px dashed var(--border-strong); border-radius:var(--r-md); overflow:hidden;">
												<button type="button" style="width:100%; padding:10px 14px; text-align:left; display:flex; align-items:center; gap:8px; background:transparent;"
													onclick={() => toggleNewContact(client.id)}>
													<Icon name="plus" size={12}/>
													<span style="font-size:12px; color:var(--text-muted);">Нов контакт</span>
												</button>
												{#if isNewContactExpanded(client.id)}
													<form method="POST" action="?/addContact" style="padding:14px; background:var(--surface); border-top:1px solid var(--border);">
														<input type="hidden" name="clientId" value={client.id} />
														<div style="display:grid; grid-template-columns:1fr 1fr; gap:10px; margin-bottom:10px;">
															<div class="field">
																<label class="label" for="new-contact-name-{client.id}">Име</label>
																<input class="input" id="new-contact-name-{client.id}" name="name" type="text"
																	value={contactFieldValue(client.id, 'name')} required />
																{#if contactFieldError(client.id, 'name')}<span style="color:var(--danger); font-size:11px;">{contactFieldError(client.id, 'name')}</span>{/if}
															</div>
															<div class="field">
																<label class="label" for="new-contact-role-{client.id}">Роля</label>
																<input class="input" id="new-contact-role-{client.id}" name="roleTitle" type="text"
																	value={contactFieldValue(client.id, 'roleTitle')} />
															</div>
															<div class="field">
																<label class="label" for="new-contact-email-{client.id}">Имейл</label>
																<input class="input" id="new-contact-email-{client.id}" name="email" type="email"
																	value={contactFieldValue(client.id, 'email')} />
															</div>
															<div class="field">
																<label class="label" for="new-contact-phone-{client.id}">Телефон</label>
																<input class="input" id="new-contact-phone-{client.id}" name="phone" type="text"
																	value={contactFieldValue(client.id, 'phone')} />
															</div>
														</div>
														<button type="submit" class="btn btn-secondary btn-sm">Добави контакт</button>
													</form>
												{/if}
											</div>
										{/if}
									</div>
								{/if}
							</div>
						</td>
					</tr>
				{/if}
			{:else}
				<tr>
					<td colspan="7" class="muted" style="text-align:center; padding:24px;">Няма клиенти.</td>
				</tr>
			{/each}
		</tbody>
	</table>
</div>
